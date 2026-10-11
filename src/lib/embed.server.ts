/** Server-only helper: create embeddings with NVIDIA NIM. */
export type EmbeddingInputType = "passage" | "query";

export async function embedTexts(
  inputs: string[],
  inputType: EmbeddingInputType = "passage",
): Promise<number[][]> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("Missing NVIDIA_API_KEY");
  if (inputs.length === 0) return [];

  const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/nemotron-3-embed-1b",
      input: inputs,
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `NVIDIA embeddings failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };

  const embeddings = json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  if (embeddings.length !== inputs.length) {
    throw new Error(
      `NVIDIA embeddings returned ${embeddings.length} vectors for ${inputs.length} inputs`,
    );
  }

  if (embeddings.some((embedding) => embedding.length !== 2048)) {
    throw new Error(
      "NVIDIA embeddings returned an unexpected vector dimension (expected 2048)",
    );
  }

  return embeddings;
}

/** Chunk a long string into ~1200-char pieces, respecting paragraph breaks. */
export function chunkText(text: string, target = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= target) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + target);
    // try to break at a paragraph or sentence
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
  return chunks.filter((c) => c.length > 30);
}
  
