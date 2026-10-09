import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AIProviderName =
  | "nvidia"
  | "lovable"
  | "gemini"
  | "groq"
  | "openrouter";

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
    baseURL:
      "https://generativelanguage.googleapis.com/v1beta/openai/",
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
      "HTTP-Referer":
        "https://redcheckerlawbot.vercel.app",
      "X-Title": "Red Checker Law Bot",
    },
  });
}

export function createAvailableModel() {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // NVIDIA is the primary provider when configured.
  if (nvidiaKey) {
    return {
      provider: "nvidia" as const,
      model: createNvidiaProvider(nvidiaKey)(
        "openai/gpt-oss-20b",
      ),
    };
  }

  // Existing providers remain available as fallbacks.
  if (lovableKey) {
    return {
      provider: "lovable" as const,
      model: createLovableProvider(lovableKey)(
        "google/gemini-3.7-flash",
      ),
    };
  }

  if (groqKey) {
    return {
      provider: "groq" as const,
      model: createGroqProvider(groqKey)(
        "openai/gpt-oss-120b",
      ),
    };
  }

  if (openRouterKey) {
    return {
      provider: "openrouter" as const,
      model: createOpenRouterProvider(openRouterKey)(
        "openai/gpt-oss-120b:free",
      ),
    };
  }

  if (geminiKey) {
    return {
      provider: "gemini" as const,
      model: createGeminiProvider(geminiKey)(
        "gemini-3-flash-preview",
      ),
    };
  }

  throw new Error(
    "No AI provider configured. Set NVIDIA_API_KEY, " +
      "LOVABLE_API_KEY, GROQ_API_KEY, " +
      "OPENROUTER_API_KEY, or GEMINI_API_KEY.",
  );
        }
