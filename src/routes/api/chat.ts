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
import { embedTexts } from "@/lib/embed.server";
import type { Database } from "@/integrations/supabase/types";

type ChatRequestBody = { messages?: unknown };

type FirecrawlResult = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  content?: string;
  metadata?: {
    title?: string;
    sourceURL?: string;
    statusCode?: number;
  };
};

type FirecrawlResponse = {
  success?: boolean;
  error?: string;
  data?: {
    web?: FirecrawlResult[];
  } | FirecrawlResult[];
};

function isApprovedLegalSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    return MALAWI_LAW_DOMAINS.some((domain) => {
      const approvedDomain = domain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];

      const normalizedHost = hostname.replace(/^www\./, "");

      return (
        normalizedHost === approvedDomain ||
        normalizedHost.endsWith(`.${approvedDomain}`)
      );
    });
  } catch {
    return false;
  }
}

async function firecrawlSearch(query: string) {
  const key = process.env.FIRECRAWL_API_KEY;

  if (!key) {
    return {
      results: [],
      error:
        "Legal web search is unavailable because FIRECRAWL_API_KEY is not configured. Do not present unverified legal provisions as confirmed law.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        query,
        limit: 5,
        includeDomains: MALAWI_LAW_DOMAINS,
        scrapeOptions: {
          formats: ["markdown"],
        },
      }),
    });

    if (!res.ok) {
      console.error(`[legal-search] Firecrawl returned ${res.status}`);

      return {
        results: [],
        error:
          "The legal source search failed. Do not claim that a specific Act, section, offence, penalty, or court decision has been verified.",
      };
    }

    const json = (await res.json()) as FirecrawlResponse;

    const data = json.data;

    const pages: FirecrawlResult[] = Array.isArray(data)
      ? data
      : data?.web ?? [];

    const results = pages
      .filter((page) => {
        return typeof page.url === "string" &&
          isApprovedLegalSource(page.url);
      })
      .map((page) => {
        const text = page.markdown ?? page.content ?? "";

        return {
          title:
            page.title ??
            page.metadata?.title ??
            "Legal source",
          url: page.url!,
          description: page.description ?? "",
          content: text.slice(0, 8000),
          contentRetrieved: text.trim().length > 0,
        };
      })
      .filter((page) => page.contentRetrieved)
      .slice(0, 5);

    return {
      results,
      note:
        results.length > 0
          ? "These results contain retrieved page content from approved legal domains. Check the actual text before making legal claims. A search result alone does not establish that a law is current or applicable."
          : "No readable legal page content was retrieved from the approved sources. Do not invent legal citations or claim that a provision has been verified.",
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && error.name === "AbortError";

    console.error(
      "[legal-search] Search request failed:",
      timedOut ? "Request timed out" : "Network or response error",
    );

    return {
      results: [],
      error: timedOut
        ? "The legal source search timed out."
        : "The legal source search could not be completed.",
      note:
        "Do not invent legal citations or present unverified statutory claims as confirmed law.",
    };
  } finally {
    clearTimeout(timeout);
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
Search approved Malawi legal sources and retrieve the actual page text.

MANDATORY USE:
- When answering whether an action is legal or illegal in Malawi.
- When identifying an offence, statutory prohibition, legal right, penalty, or punishment.
- When citing a specific Act, section, constitutional article, regulation, or court case.
- When asked whether a particular law exists.
- When explaining a legal procedure or a potentially current legal requirement.

Search before making a specific legal claim. Search results include retrieved page content when available. Use that content to check what the source actually says.

Never invent a section number, Act, court case, quotation, penalty, or source URL. If the search fails or the retrieved content does not establish the answer, clearly explain the limitation and ask the user to consult an authoritative source or qualified legal practitioner.
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
                return firecrawlSearch(query);
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

Do not answer these questions from model memory alone when live research is available.

### How to use retrieved information
1. Read the retrieved page content, not just its title or description.
2. Identify what the source actually establishes.
3. Give the Act and section or constitutional article only when supported by the retrieved content or another reliable, clearly identified source.
4. Include a clickable source link using the exact URL returned by the search tool.
5. Distinguish the wording of the law from your explanation or interpretation.
6. Do not assume that a search result is current, in force, or applicable to the facts without adequate evidence.
7. If a page is an old version, a secondary commentary, or does not contain the relevant provision, say so.

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

You may explain what is known, identify what remains uncertain, and suggest what official source or legal practitioner could confirm it. Never claim that a legal search succeeded when it failed.

### Tool use
- Use search_malawi_law for public legal sources and current legal research.
- Use search_uploaded_documents for the user's own uploaded documents only.
- An uploaded document is not automatically an authoritative statement of current law.

Always prefer verified source content over memory when the relevant fact can be researched.
          `.trim();

          const result = streamText({
            model,

            system: systemPrompt,

            messages: await convertToModelMessages(
              messages as UIMessage[],
            ),

            tools,

            stopWhen: stepCountIs(6),
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
