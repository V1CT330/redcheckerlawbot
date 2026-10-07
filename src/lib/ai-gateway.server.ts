import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AIProviderName = "gemini" | "groq" | "openrouter";

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

export function createAvailableModel() {
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (groqKey) {
    return {
      provider: "groq" as const,
      model: createGroqProvider(groqKey)("openai/gpt-oss-120b"),
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
    "No AI provider configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY.",
  );
}
