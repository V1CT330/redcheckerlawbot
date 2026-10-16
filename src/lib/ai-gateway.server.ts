import { wrapLanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AIProviderName =
  | "nvidia"
  | "lovable"
  | "gemini"
  | "groq"
  | "openrouter";

type ConfiguredModel = {
  provider: AIProviderName;
  model: ReturnType<ReturnType<typeof createNvidiaProvider>>;
};

export function createNvidiaProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
  });
}

export function createLovableProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey },
  });
}

export function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "google-gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey,
  });
}

export function createGroqProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
  });
}

export function createOpenRouterProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": "https://redcheckerlawbot.vercel.app",
      "X-Title": "Red Checker Law Bot",
    },
  });
}

function getConfiguredModels(): ConfiguredModel[] {
  const models: ConfiguredModel[] = [];
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Preserve the configured priority order. Later entries are automatic fallbacks.
  if (nvidiaKey) {
    models.push({
      provider: "nvidia",
      model: createNvidiaProvider(nvidiaKey)("openai/gpt-oss-20b"),
    });
  }
  if (lovableKey) {
    models.push({
      provider: "lovable",
      model: createLovableProvider(lovableKey)("google/gemini-3.7-flash"),
    });
  }
  if (groqKey) {
    models.push({
      provider: "groq",
      model: createGroqProvider(groqKey)("openai/gpt-oss-120b"),
    });
  }
  if (openRouterKey) {
    models.push({
      provider: "openrouter",
      model: createOpenRouterProvider(openRouterKey)("openai/gpt-oss-120b:free"),
    });
  }
  if (geminiKey) {
    models.push({
      provider: "gemini",
      model: createGeminiProvider(geminiKey)("gemini-3-flash-preview"),
    });
  }

  return models;
}

/**
 * Selects the first configured provider and retries subsequent configured
 * providers if the provider rejects the generation/stream request before it
 * starts. Once a stream has emitted data, transparent replay is not safe.
 */
export function createAvailableModel() {
  const candidates = getConfiguredModels();
  const primary = candidates[0];

  if (!primary) {
    throw new Error(
      "No AI provider configured. Set NVIDIA_API_KEY, LOVABLE_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY.",
    );
  }

  const fallbacks = candidates.slice(1);
  if (fallbacks.length === 0) return primary;

  const model = wrapLanguageModel({
    model: primary.model,
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        let lastError: unknown;
        try {
          return await doGenerate();
        } catch (error) {
          lastError = error;
        }

        for (const fallback of fallbacks) {
          try {
            console.warn(`[ai-failover] trying ${fallback.provider} after provider failure`);
            return await fallback.model.doGenerate(params);
          } catch (error) {
            lastError = error;
            console.error(`[ai-failover] ${fallback.provider} generation failed`);
          }
        }

        throw lastError;
      },
      wrapStream: async ({ doStream, params }) => {
        let lastError: unknown;

        // Some providers return a stream successfully, then fail before sending
        // useful output. Probe the stream before committing to that provider so
        // early failures can still fall back to another configured provider.
        const openUsableStream = async (
          open: () => ReturnType<typeof doStream>,
        ) => {
          const response = await open();
          const reader = response.stream.getReader();
          const buffered: unknown[] = [];
          let firstUsefulChunk = false;

          try {
            // Buffer setup events until text, reasoning, a tool call, or a source
            // appears. Time out rather than leaving the chat stuck indefinitely.
            for (let index = 0; index < 32; index += 1) {
              const item = await new Promise<ReadableStreamReadResult<unknown>>(
                (resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error("Provider produced no usable output")),
                    8000,
                  );
                  reader.read().then(
                    (value) => {
                      clearTimeout(timer);
                      resolve(value);
                    },
                    (error) => {
                      clearTimeout(timer);
                      reject(error);
                    },
                  );
                },
              );

              if (item.done) break;
              buffered.push(item.value);

              const part = item.value as { type?: string };
              if (
                part.type === "text-delta" ||
                part.type === "reasoning-delta" ||
                part.type === "tool-call" ||
                part.type === "tool-input-end" ||
                part.type === "source"
              ) {
                firstUsefulChunk = true;
                break;
              }
            }

            if (!firstUsefulChunk) {
              throw new Error("Provider stream ended before useful output");
            }
          } catch (error) {
            try {
              await reader.cancel(error);
            } catch {
              // The provider may already have closed the stream.
            }
            try {
              reader.releaseLock();
            } catch {
              // Ignore an already released lock.
            }
            throw error;
          }

          const stream = new ReadableStream({
            async start(controller) {
              for (const part of buffered) controller.enqueue(part);
              try {
                while (true) {
                  const item = await reader.read();
                  if (item.done) break;
                  controller.enqueue(item.value);
                }
                controller.close();
              } catch (error) {
                controller.error(error);
              } finally {
                try {
                  reader.releaseLock();
                } catch {
                  // Ignore an already released lock.
                }
              }
            },
          });

          return { ...response, stream };
        };

        try {
          return await openUsableStream(doStream);
        } catch (error) {
          lastError = error;
          console.warn("[ai-failover] primary stream failed before output");
        }

        for (const fallback of fallbacks) {
          try {
            console.warn(
              `[ai-failover] trying ${fallback.provider} after early stream failure`,
            );
            return await openUsableStream(() => fallback.model.doStream(params));
          } catch (error) {
            lastError = error;
            console.error(
              `[ai-failover] ${fallback.provider} stream failed before output`,
            );
          }
        }

        throw lastError;
      },
    },
  });

  return { provider: primary.provider, model };
}
