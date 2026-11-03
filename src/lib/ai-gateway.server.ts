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
    headers: {
      "Lovable-API-Key": apiKey,
    },
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
      "X-Title": "RedBot Law Checker",
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

  // Preserve the existing provider priority and model IDs.
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
 * Try configured providers in order when the selected provider rejects the
 * request before streaming begins. Once a stream has started, do not replay
 * the prompt: doing so could duplicate or contradict text already delivered.
 */
function withFirstChunkTimeout<T>(stream: ReadableStream<T>, timeoutMs = 15000) {
  return new ReadableStream<T>({
    async start(controller) {
      const reader = stream.getReader();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const first = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("AI provider first-event timeout")), timeoutMs);
          }),
        ]);
        if (timer) clearTimeout(timer);
        if (first.done) {
          controller.close();
          return;
        }
        controller.enqueue(first.value);
        while (true) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(next.value);
        }
      } catch (error) {
        if (timer) clearTimeout(timer);
        try { await reader.cancel(error); } catch { /* Stream already closed. */ }
        controller.error(error);
      } finally {
        if (timer) clearTimeout(timer);
        reader.releaseLock();
      }
    },
  });
}

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
          console.error(`[ai-failover] ${primary.provider} generation request failed`);
        }

        for (const fallback of fallbacks) {
          try {
            console.warn(`[ai-failover] trying ${fallback.provider} for generation`);
            return await fallback.model.doGenerate(params);
          } catch (error) {
            lastError = error;
            console.error(`[ai-failover] ${fallback.provider} generation request failed`);
          }
        }

        throw lastError;
      },

      wrapStream: async ({ doStream, params }) => {
        let lastError: unknown;

        try {
          const result = await doStream();
          return { ...result, stream: withFirstChunkTimeout(result.stream) };
        } catch (error) {
          lastError = error;
          console.error(`[ai-failover] ${primary.provider} stream request failed`);
        }

        for (const fallback of fallbacks) {
          try {
            console.warn(`[ai-failover] trying ${fallback.provider} for streaming`);
            const result = await fallback.model.doStream(params);
            return { ...result, stream: withFirstChunkTimeout(result.stream) };
          } catch (error) {
            lastError = error;
            console.error(`[ai-failover] ${fallback.provider} stream request failed`);
          }
        }

        throw lastError;
      },
    },
  });

  return { provider: primary.provider, model };
}
