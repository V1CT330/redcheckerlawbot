
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

type EmbeddingResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
};

async function requestEmbeddings(
  url: string,
  headers: Record<string, string>,
  inputs: string[],
): Promise<number[][]> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Embeddings failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await response.json()) as EmbeddingResponse;

  if (!Array.isArray(json.data) || json.data.length !== inputs.length) {
    throw new Error("Embedding service returned incomplete results.");
  }

  const ordered = json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  if (
    ordered.some(
      (vector) =>
        !Array.isArray(vector) ||
        vector.length !== EMBEDDING_DIMENSIONS ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Invalid embedding dimensions returned by the provider.");
  }

  return ordered;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (openRouterKey) {
    try {
      return await requestEmbeddings(
        "https://openrouter.ai/api/v1/embeddings",
        {
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer":
            process.env.APP_URL ?? "https://redcheckerlawbot.vercel.app",
          "X-Title": "RedBot Law Checker",
        },
        inputs,
      );
    } catch (error) {
      const lovableKey = process.env.LOVABLE_API_KEY;

      if (!lovableKey) throw error;

      console.error(
        "[embeddings] OpenRouter failed; trying Lovable gateway.",
        error,
      );
    }
  }

  const lovableKey = process.env.LOVABLE_API_KEY;

  if (lovableKey) {
    return requestEmbeddings(
      "https://ai.gateway.lovable.dev/v1/embeddings",
      { "Lovable-API-Key": lovableKey },
      inputs,
    );
  }

  throw new Error(
    "No embedding provider configured. Add OPENROUTER_API_KEY to Vercel, or configure LOVABLE_API_KEY.",
  );
}

/** Split text into overlapping chunks for document search. */
export function chunkText(
  text: string,
  target = 1200,
  overlap = 150,
): string[] {
  const clean = text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (clean.length <= target) return clean ? [clean] : [];

  const chunks: string[] = [];
  let i = 0;

  while (i < clean.length) {
    let end = Math.min(clean.length, i + target);

    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const paraBreak = slice.lastIndexOf("\n\n");
      const sentBreak = slice.lastIndexOf(". ");

      const cut =
        paraBreak > target * 0.5
          ? paraBreak
          : sentBreak > target * 0.5
            ? sentBreak + 1
            : end - i;

      end = i + cut;
    }

    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;

    if (i < 0) i = 0;
  }

  return chunks.filter((chunk) => chunk.length > 30);
      }
