/** Server-only helper: call Lovable AI Gateway /v1/embeddings. */
export async function embedTexts(inputs: string[]): Promise<number[][]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  if (inputs.length === 0) return [];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: inputs,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embeddings failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
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
      const cut = paraBreak > target * 0.5 ? paraBreak : sentBreak > target * 0.5 ? sentBreak + 1 : end - i;
      end = i + cut;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.length > 30);
}
