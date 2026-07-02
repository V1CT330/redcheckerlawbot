import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("id,title,status,size_bytes,created_at,page_count")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (doc?.storage_path) {
      await context.supabase.storage.from("law-pdfs").remove([doc.storage_path]);
    }
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Ingest a PDF: client sends already-extracted text (via pdfjs in the browser).
 * Server chunks, embeds, uploads original bytes to storage, and stores rows.
 */
export const ingestPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        text: z.string().min(20).max(2_000_000),
        pageCount: z.number().int().min(1).max(2000),
        fileBase64: z.string().min(1).max(30_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { chunkText, embedTexts } = await import("./embed.server");
    const chunks = chunkText(data.text);
    if (chunks.length === 0) throw new Error("Could not extract text from PDF.");

    // upload original file to storage under {userId}/{docId}.pdf
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const docId = crypto.randomUUID();
    const storagePath = `${context.userId}/${docId}.pdf`;
    const { error: upErr } = await context.supabase.storage
      .from("law-pdfs")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: doc, error: dErr } = await context.supabase
      .from("documents")
      .insert({
        id: docId,
        user_id: context.userId,
        title: data.title,
        storage_path: storagePath,
        size_bytes: bytes.byteLength,
        page_count: data.pageCount,
        status: "processing",
      })
      .select("id")
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Insert failed");

    // Embed in batches of 32
    try {
      const batchSize = 32;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const vecs = await embedTexts(batch);
        const rows = batch.map((content, j) => ({
          document_id: doc.id,
          user_id: context.userId,
          chunk_index: i + j,
          content,
          embedding: vecs[j] as unknown as string,
        }));
        const { error: cErr } = await context.supabase.from("document_chunks").insert(rows);
        if (cErr) throw new Error(cErr.message);
      }
      await context.supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await context.supabase
        .from("documents")
        .update({ status: "error", error: message.slice(0, 500) })
        .eq("id", doc.id);
      throw err;
    }

    return { id: doc.id, chunkCount: chunks.length };
  });
