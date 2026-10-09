import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
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

async function firecrawlSearch(query: string) {
  const key = process.env.FIRECRAWL_API_KEY;

  if (!key) {
    return {
      results: [],
      error: "Web search unavailable (missing API key).",
    };
  }

  const scopedQuery = `${query} (${MALAWI_LAW_DOMAINS.map(
    (d) => `site:${d}`,
  ).join(" OR ")})`;

  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: scopedQuery,
      limit: 5,
    }),
  });

  if (!res.ok) {
    const body = await res.text();

    return {
      results: [],
      error: `Search error ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as {
    data?: {
      web?: Array<{
        url: string;
        title: string;
        description?: string;
      }>;
    };
  };

  const web = json.data?.web ?? [];

  return {
    results: web.map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description ?? "",
    })),
  };
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

        // Use RedBot's hosted Developer API when configured on Vercel.
        // Keep the API key on the server and out of browser code.
        const redbotApiKey = process.env.REDBOT_API_KEY;

        if (redbotApiKey) {
          try {
            const recentMessages = (messages as UIMessage[])
              .slice(-8)
              .map((message) => {
                const text = message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n");

                return text ? `${message.role}: ${text}` : "";
              })
              .filter(Boolean)
              .join("\n\n")
              .slice(-4000);

            if (!recentMessages.trim()) {
              return Response.json(
                { error: "Please enter a legal question." },
                { status: 400 },
              );
            }

            const apiResponse = await fetch(
              "https://redcheckerlawbot.lovable.app/api/public/v1/ask",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${redbotApiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  question: recentMessages,
                }),
              },
            );

            const payload = (await apiResponse.json().catch(() => ({}))) as {
              answer?: unknown;
              error?: unknown;
            };

            if (!apiResponse.ok) {
              console.error(
                "[chat] RedBot Developer API error",
                apiResponse.status,
                payload.error,
              );

              return Response.json(
                {
                  error:
                    typeof payload.error === "string"
                      ? payload.error
                      : "The RedBot API request failed.",
                },
                {
                  status: apiResponse.status === 429 ? 429 : 502,
                },
              );
            }

            if (typeof payload.answer !== "string") {
              return Response.json(
                { error: "The RedBot API returned no answer." },
                { status: 502 },
              );
            }

            const messageId = crypto.randomUUID();
            const textId = crypto.randomUUID();

            const stream = createUIMessageStream({
              execute: ({ writer }) => {
                writer.write({
                  type: "start",
                  messageId,
                });

                writer.write({
                  type: "text-start",
                  id: textId,
                });

                writer.write({
                  type: "text-delta",
                  id: textId,
                  delta: payload.answer as string,
                });

                writer.write({
                  type: "text-end",
                  id: textId,
                });

                writer.write({
                  type: "finish",
                  finishReason: "stop",
                });
              },
            });

            return createUIMessageStreamResponse({ stream });
          } catch (error) {
            console.error(
              "[chat] RedBot Developer API request failed",
              error,
            );

            return Response.json(
              {
                error:
                  "Could not reach the RedBot API. Please try again.",
              },
              { status: 502 },
            );
          }
        }

        // Original AI-provider path remains unchanged when REDBOT_API_KEY
        // is not configured.
        try {
          const { model, provider } = createAvailableModel();

          console.info(`[chat] using ${provider} provider`);

          const tools = {
            search_malawi_law: tool({
              description:
                "Search the live web across MalawiLII, Malawi Government portals and official legal sites for statutes, cases or policies. Use this when the user asks about a specific Act, section, case, or recent development.",

              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    "Focused search query, e.g. 'Employment Act section 57 notice period'",
                  ),
              }),

              execute: async ({ query }) => firecrawlSearch(query),
            }),

            search_uploaded_documents: tool({
              description:
                "Semantic search over PDFs the signed-in user has uploaded (their private legal library). Use when the user references 'my document', 'the contract I uploaded', or otherwise asks about their own files.",

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
                          const h = new Headers(init?.headers);
                          h.set("apikey", pk);

                          return fetch(input, {
                            ...init,
                            headers: h,
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
                      note: "Sign in to search your uploaded documents.",
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
                    return {
                      matches: [],
                      error: error.message,
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
                } catch (e) {
                  return {
                    matches: [],
                    error: e instanceof Error ? e.message : "Search failed",
                  };
                }
              },
            }),
          };

          const result = streamText({
            model,

            system:
              MALAWI_LAW_SYSTEM_PROMPT +
              "\n\n## Tools\nYou have two tools:\n- `search_malawi_law` for the live web (MalawiLII, gov.mw). Use it when the user asks about a specific Act, section, case or recent development, then cite the URL you found.\n- `search_uploaded_documents` for the user's own uploaded PDFs. Use it whenever they reference their document/contract/upload; quote the snippet and name the document.\n\nAlways prefer tool-grounded answers over memory when a fact is fetchable.",

            messages: await convertToModelMessages(messages as UIMessage[]),

            tools,

            stopWhen: stepCountIs(6),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            onError: (error) => {
              console.error(`[chat] ${provider} stream error`, error);
              const msg =
                error instanceof Error ? error.message : String(error);

              return `AI provider (${provider}) error: ${msg.slice(0, 300)}`;
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
});e(0, 800),
                        similarity: Number(r.similarity.toFixed(3)),
                      }),
                    ),
                  };
                } catch (e) {
                  return {
                    matches: [],
                    error: e instanceof Error ? e.message : "Search failed",
                  };
                }
              },
            }),
          };

          const result = streamText({
            model,

            system:
              MALAWI_LAW_SYSTEM_PROMPT +
              "\n\n## Tools\nYou have two tools:\n- `search_malawi_law` for the live web (MalawiLII, gov.mw). Use it when the user asks about a specific Act, section, case or recent development, then cite the URL you found.\n- `search_uploaded_documents` for the user's own uploaded PDFs. Use it whenever they reference their document/contract/upload; quote the snippet and name the document.\n\nAlways prefer tool-grounded answers over memory when a fact is fetchable.",

            messages: await convertToModelMessages(messages as UIMessage[]),

            tools,

            stopWhen: stepCountIs(6),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
            onError: (error) => {
              console.error(`[chat] ${provider} stream error`, error);
              const msg =
                error instanceof Error ? error.message : String(error);

              return `AI provider (${provider}) error: ${msg.slice(0, 300)}`;
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
