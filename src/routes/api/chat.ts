import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createAvailableModel } from "@/lib/ai-gateway.server";
import { MALAWI_LAW_SYSTEM_PROMPT } from "@/lib/malawi-law-prompt";
import { MALAWI_LAW_DOMAINS } from "@/lib/malawi-law-links";
import { searchLegalLibrary } from "@/lib/legal-library.server";
import { reviewLegalQuestionWithAgents } from "@/lib/multi-agent.server";
import { embedTexts } from "@/lib/embed.server";
import type { Database } from "@/integrations/supabase/types";

type ChatRequestBody = { messages?: unknown };

function isApprovedLegalSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    return MALAWI_LAW_DOMAINS.some((domain) => {
      const approvedDomain = domain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];

      return (
        hostname === approvedDomain ||
        hostname.endsWith(`.${approvedDomain}`)
      );
    });
  } catch {
    return false;
  }
}

/**
 * Searches only RedBot's stored legal library.
 * No external search service is called during chat.
 */
async function searchMalawiLaw(query: string) {
  try {
    const library = await Promise.race([
      searchLegalLibrary(query, 3),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Legal library search timed out")), 3500),
      ),
    ]);

    const results = library.results
      .filter((item) => isApprovedLegalSource(item.source_url))
      .map((item) => ({
        title: item.title,
        url: item.source_url,
        description: [
          `Document type: ${item.document_type}.`,
          `Last checked: ${item.last_crawled_at}.`,
          item.source_updated_at
            ? `Source updated: ${item.source_updated_at}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        content: item.content,
        contentRetrieved: true,
      }));

    const agentReviews = await reviewLegalQuestionWithAgents(
      query,
      results.map((item) => `${item.title}\n${item.url}\n${item.content}`).join("\n\n"),
    );

    return {
      results,
      agent_reviews: agentReviews,
      source: "redbot_legal_library",
      note:
        results.length > 0
          ? "These results came from RedBot's stored legal library. Check the source text and dates before making legal claims. A stored document is not automatically the current law."
          : "No matching documents were found in RedBot's stored legal library. Do not invent legal citations or present unverified statutory claims as confirmed law. Explain that verification was unavailable.",
    };
  } catch (error) {
    console.error(
      "[legal-search] Shared library search failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return {
      results: [],
      source: "redbot_legal_library",
      error: "RedBot's stored legal library search is temporarily unavailable.",
      note:
        "Do not invent legal citations or present unverified statutory claims as confirmed law. Explain that verification was unavailable.",
    };
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;

        if (!Array.isArray(messages)) {
          return new Response("Messages are required", {
            status: 400,
          });
        }

        const authHeader = request.headers.get("authorization");

        const userToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

        try {
          const { model, provider } = createAvailableModel();

          console.info(`[chat] using ${provider} provider`);

          const tools = {
            search_malawi_law: tool({
              description: `
Search RedBot's stored legal library for Malawian legal documents.

MANDATORY USE:
- When answering whether an action is legal or illegal in Malawi.
- When identifying an offence, statutory prohibition, legal right, penalty, or punishment.
- When citing a specific Act, section, constitutional article, regulation, or court case.
- When asked whether a particular law exists.
- When explaining a legal procedure or a potentially current legal requirement.

Read the retrieved content, not just titles or descriptions. Check the source URL and dates. Stored documents may be outdated.

If no matching documents are found, do not invent legal provisions or citations. Explain that the library could not verify the answer.
              `.trim(),

              inputSchema: z.object({
                query: z
                  .string()
                  .min(3)
                  .max(500)
                  .describe(
                    "A focused search query about Malawi law, including the legal issue and any known Act or section.",
                  ),
              }),

              execute: async ({ query }) => {
                return searchMalawiLaw(query);
              },
            }),

            search_uploaded_documents: tool({
              description:
                "Search PDFs the signed-in user has uploaded to their private legal library. Use when the user refers to their own document, contract, or uploaded file. Do not confuse these documents with official legislation.",

              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    "Question or keywords to look up in the user's uploaded documents.",
                  ),

                k: z.number().int().min(1).max(10).default(6),
              }),

              execute: async ({ query, k }) => {
                if (!userToken) {
                  return {
                    matches: [],
                    note: "Sign in to search your uploaded documents.",
                  };
                }

                try {
                  const pk = process.env.SUPABASE_PUBLISHABLE_KEY!;

                  const supabase = createClient<Database>(
                    process.env.SUPABASE_URL!,
                    pk,
                    {
                      global: {
                        headers: {
                          Authorization: `Bearer ${userToken}`,
                        },

                        fetch: (input, init) => {
                          const headers = new Headers(init?.headers);
                          headers.set("apikey", pk);

                          return fetch(input, {
                            ...init,
                            headers,
                          });
                        },
                      },

                      auth: {
                        storage: undefined,
                        persistSession: false,
                        autoRefreshToken: false,
                      },
                    },
                  );

                  const {
                    data: claims,
                    error: claimsErr,
                  } = await supabase.auth.getClaims(userToken);

                  if (claimsErr || !claims?.claims?.sub) {
                    return {
                      matches: [],
                      note:
                        "Your session could not be verified. Sign in again to search your uploaded documents.",
                    };
                  }

                  const [embedding] = await embedTexts([query]);

                  const { data, error } = await supabase.rpc(
                    "match_document_chunks",
                    {
                      query_embedding: embedding as unknown as string,
                      match_count: k,
                    },
                  );

                  if (error) {
                    console.error(
                      "[chat] Uploaded document search failed:",
                      error.message,
                    );

                    return {
                      matches: [],
                      error: "Uploaded document search failed.",
                    };
                  }

                  return {
                    matches: (data ?? []).map(
                      (r: {
                        title: string;
                        content: string;
                        similarity: number;
                      }) => ({
                        document: r.title,
                        snippet: r.content.slice(0, 800),
                        similarity: Number(r.similarity.toFixed(3)),
                      }),
                    ),
                  };
                } catch (error) {
                  console.error(
                    "[chat] Uploaded document search failed:",
                    error instanceof Error
                      ? error.message
                      : "Unknown error",
                  );

                  return {
                    matches: [],
                    error: "Uploaded document search failed.",
                  };
                }
              },
            }),
          };

          const systemPrompt = `
${MALAWI_LAW_SYSTEM_PROMPT}

## Legal accuracy and source verification

You are assisting users with Malawian law. Accuracy is more important than sounding confident.

### When to search
Use search_malawi_law before answering questions about whether conduct is legal or illegal, whether a law exists, the meaning of a specific statutory provision, offences, penalties, legal rights, procedures, and current legal requirements.

Do not answer these questions from model memory alone when legal research is available.

### How to use retrieved information
1. Read the retrieved page content, not just its title or description.
2. Identify what the source actually establishes.
3. Give the Act and section or constitutional article only when supported by the retrieved content or another reliable, clearly identified source.
4. Include a clickable source link using the exact URL returned by the search tool.
5. Distinguish the wording of the law from your explanation or interpretation.
6. Do not assume that a document is current, in force, or applicable without adequate evidence.
7. If a page is an old version, secondary commentary, or does not contain the relevant provision, say so.
8. Check last-checked and source-update dates for stored documents.

### Independent agent reviews
The legal-library search may include short reviews from multiple AI providers. Treat these reviews as advisory analysis only, not as legal authority. Agent agreement is not proof. Prefer the actual retrieved legal text and verified sources; disregard unsupported agent claims and explain material uncertainty.

### If verification fails
If the search returns an error, no readable content, or insufficient evidence, tell the user that you could not verify the specific provision.

Do not invent:
- Act names or section numbers;
- constitutional articles;
- criminal offences or penalties;
- court cases or quotations;
- source links;
- claims that a person has committed a crime.

Do not treat general principles, such as fraud or freedom of religion, as proof that a specific action is illegal.

Explain what is known, identify what remains uncertain, and suggest which official source or legal practitioner could confirm it. Never claim that a legal search succeeded when it failed.

### Response formatting — keep it clean and readable
- Write in plain, natural paragraphs with short, descriptive headings when useful.
- Do not use Markdown tables for ordinary answers. Explain comparisons as short bullet lists instead.
- Do not put normal explanations, legal advice, citations, or summaries inside fenced code blocks.
- Avoid blockquotes, callout panels, decorative boxes, and excessive nested lists.
- Keep legal citations inline in the sentence or as a simple numbered/bulleted source list with clickable links.
- Use numbered steps only for procedures; otherwise prefer concise paragraphs and simple bullets.
- Optimize formatting for a narrow mobile screen. Make the answer easy to scan without visual clutter.

### Tool use
- Use search_malawi_law for public legal documents stored in RedBot's library.
- Use search_uploaded_documents for the user's own uploaded documents only.
- An uploaded document is not automatically an authoritative statement of current law.
- Prefer verified source content over memory when the relevant fact can be researched.
          `.trim();

          const result = streamText({
            model,
            system: systemPrompt,
            messages: await convertToModelMessages(
              messages as UIMessage[],
            ),
            tools,
            // Allow a tool call, its result, and a follow-up generation to complete.
            // A two-step limit can stop immediately after a second tool call, leaving
            // the UI with an assistant message that contains no visible text.
            stopWhen: stepCountIs(4),
            maxOutputTokens: 700,
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],

            onError: (error) => {
              console.error(
                `[chat] ${provider} stream error`,
                error,
              );

              return "Something went wrong generating the reply. Please try again.";
            },
          });
        } catch (err) {
          console.error("[chat] streamText error", err);

          const status =
            err &&
            typeof err === "object" &&
            "status" in err
              ? Number((err as { status?: number }).status) || 500
              : 500;

          return new Response(
            status === 429
              ? "Rate limit exceeded. Please wait a moment and try again."
              : status === 402
                ? "AI provider credits or rate limits were exhausted. Please try again shortly."
                : "Something went wrong generating the reply.",
            { status },
          );
        }
      },
    },
  },
});
