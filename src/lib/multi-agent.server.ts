import { generateText } from "ai";
import {
  createGeminiProvider,
  createGroqProvider,
  createLovableProvider,
  createNvidiaProvider,
  createOpenRouterProvider,
} from "@/lib/ai-gateway.server";

type AgentCandidate = {
  name: string;
  model: ReturnType<ReturnType<typeof createNvidiaProvider>>;
};

function getConfiguredAgents(): AgentCandidate[] {
  const agents: AgentCandidate[] = [];
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (nvidiaKey) {
    agents.push({
      name: "NVIDIA",
      model: createNvidiaProvider(nvidiaKey)("openai/gpt-oss-20b"),
    });
  }
  if (groqKey) {
    agents.push({
      name: "Groq",
      model: createGroqProvider(groqKey)("openai/gpt-oss-120b"),
    });
  }
  if (geminiKey) {
    agents.push({
      name: "Gemini",
      model: createGeminiProvider(geminiKey)("gemini-3-flash-preview"),
    });
  }
  if (openRouterKey) {
    agents.push({
      name: "OpenRouter",
      model: createOpenRouterProvider(openRouterKey)("openai/gpt-oss-120b:free"),
    });
  }
  if (lovableKey) {
    agents.push({
      name: "Lovable AI",
      model: createLovableProvider(lovableKey)("google/gemini-3.7-flash"),
    });
  }

  return agents;
}

/**
 * Runs a small, bounded set of independent legal-analysis agents.
 * These are advisory reviews only; the final answer must rely on retrieved
 * legal sources, not on agent agreement or model memory.
 */
export async function reviewLegalQuestionWithAgents(
  question: string,
  sourceContext: string,
): Promise<Array<{ agent: string; review: string }>> {
  const candidates = getConfiguredAgents().slice(0, 3);
  if (candidates.length === 0) return [];

  const context = sourceContext.slice(0, 9000);
  const settled = await Promise.allSettled(
    candidates.map(async ({ name, model }) => {
      const result = await generateText({
        model,
        system: [
          "You are an independent legal-analysis reviewer for a Malawi law information assistant.",
          "Do not provide a final answer to the user.",
          "Do not invent Acts, sections, constitutional articles, cases, penalties, or URLs.",
          "Use only the source context supplied. If it does not support a claim, say so.",
          "Identify relevant supported points, gaps, contradictions, and what must be verified.",
          "Keep the review concise (maximum 120 words).",
        ].join(" "),
        prompt: `Question: ${question}\n\nRetrieved legal-library context (may be incomplete or outdated):\n${context || "No matching legal source content was retrieved."}`,
        maxOutputTokens: 220,
        abortSignal: AbortSignal.timeout(7000),
      });
      return { agent: name, review: result.text.trim() };
    }),
  );

  return settled.flatMap((result, index) =>
    result.status === "fulfilled" && result.value.review
      ? [result.value]
      : (console.warn(
          `[multi-agent] ${candidates[index]?.name ?? "Agent"} review failed; continuing with available reviews.`,
        ), []),
  );
}
