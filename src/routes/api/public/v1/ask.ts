import { createFileRoute } from "@tanstack/react-router";
import { createAvailableModel } from "@/lib/ai-gateway.server";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MALAWI_LAW_SYSTEM_PROMPT } from "@/lib/malawi-law-prompt";
import { MALAWI_LAW_DOMAINS } from "@/lib/malawi-law-links";
import { sha256Hex } from "@/lib/api-key-crypto";

export const Route = createFileRoute("/api/public/v1/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- 1. Verify the developer API key -------------------------------
        const authHeader = request.headers.get("authorization");
        const presented =
          authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : (request.headers.get("x-api-key")?.trim() ?? null);

        if (!presented?.startsWith("rlb_sk_")) {
          return Response.json(
            { error: "Missing or invalid API key. Send it as 'Authorization: Bearer rlb_sk_…'." },
            { status: 401 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const keyHash = await sha256Hex(presented);
        const { data: keyRow } = await supabaseAdmin
          .from("developer_api_keys")
          .select("id, revoked_at")
          .eq("key_hash", keyHash)
          .maybeSingle();

        if (!keyRow || keyRow.revoked_at) {
          return Response.json(
            { error: "Invalid or revoked API key." },
            { status: 401 },
          );
        }

        // Record usage (best effort).
        await supabaseAdmin
          .from("developer_api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id);

        // --- 2. Validate the request ---------------------------------------
        let question: string;
        try {
          const body = (await request.json()) as { question?: unknown };
          question = typeof body.question === "string" ? body.question.trim() : "";
        } catch {
          return Response.json({ error: "Request body must be JSON." }, { status: 400 });
        }
        if (!question) {
          return Response.json(
            { error: "'question' is required, e.g. { \"question\": \"What is the notice period under the Employment Act?\" }" },
            { status: 400 },
          );
        }
        if (question.length > 4000) {
          return Response.json({ error: "Question is too long (max 4000 characters)." }, { status: 400 });
        }

        // --- 3. Answer with the same grounded Malawi-law assistant ---------

        async function firecrawlSearch(query: string) {
          const key = process.env.FIRECRAWL_API_KEY;
          if (!key) return { results: [], error: "Web search unavailable." };
          const scopedQuery = `${query} (${MALAWI_LAW_DOMAINS.map((d) => `site:${d}`).join(" OR ")})`;
          const res = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ query: scopedQuery, limit: 5 }),
          });
          if (!res.ok) return { results: [], error: `Search error ${res.status}.` };
          const json = (await res.json()) as {
            data?: { web?: Array<{ url: string; title: string; description?: string }> };
          };
          return {
            results: (json.data?.web ?? []).map((r) => ({
              title: r.title,
              url: r.url,
              description: r.description ?? "",
            })),
          };
        }

        try {
          // Use the exact same model and settings as the in-app chat
          // so API users get the same answers as platform users.
          const { model } = createAvailableModel();

          const result = streamText({
            model,
            system:
              MALAWI_LAW_SYSTEM_PROMPT +
              "\n\n## Tools\nYou have one tool: `search_malawi_law` for the live web (MalawiLII, gov.mw). Use it when the user asks about a specific Act, section, case or recent development, then cite the URL you found.\n\nAlways prefer tool-grounded answers over memory when a fact is fetchable.",
            prompt: question,
            tools: {
              search_malawi_law: tool({
                description:
                  "Search the live web across MalawiLII, Malawi Government portals and official legal sites for statutes, cases or policies. Use this when the user asks about a specific Act, section, case, or recent development.",
                inputSchema: z.object({
                  query: z.string().describe("Focused search query, e.g. 'Employment Act section 57 notice period'"),
                }),
                execute: async ({ query }) => firecrawlSearch(query),
              }),
            },
            stopWhen: stepCountIs(6),
          });

          const answer = await result.text;
          return Response.json({
            answer,
            sources_note: "Answers cite Malawian statutes, cases and official portals where applicable.",
          });
        } catch (err) {
          console.error("[api/public/v1/ask] error", err);
          const status =
            err && typeof err === "object" && "status" in err
              ? Number((err as { status?: number }).status) || 500
              : 500;
          return Response.json(
            {
              error:
                status === 429
                  ? "Rate limit exceeded. Please retry with backoff."
                  : status === 402
                    ? "AI credits exhausted."
                    : "Something went wrong generating the answer.",
            },
            { status },
          );
        }
      },
    },
  },
});
