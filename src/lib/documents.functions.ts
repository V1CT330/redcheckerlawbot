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
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: doc, error: lookupError } = await context.supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Could not find document: ${lookupError.message}`);
    }

    if (!doc) {
      throw new Error(
        "Document not found or you do not have permission to delete it.",
      );
    }

    if (doc.storage_path) {
      const { error: storageError } = await context.supabase.storage
        .from("law-pdfs")
        .remove([doc.storage_path]);

      if (storageError) {
        throw new Error(
          `Could not delete the original PDF: ${storageError.message}`,
        );
      }
    }

    const { error: chunksError } = await context.supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", doc.id)
      .eq("user_id", context.userId);

    if (chunksError) {
      throw new Error(
        `PDF file removed, but its indexed text could not be deleted: ${chunksError.message}`,
      );
    }

    const { data: deleted, error: deleteError } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", doc.id)
      .eq("user_id", context.userId)
      .select("id");

    if (deleteError) {
      throw new Error(
        `PDF file removed, but the document record could not be deleted: ${deleteError.message}`,
      );
    }

    if (!deleted?.length) {
      throw new Error(
        "PDF file removed, but the document record was not deleted.",
      );
    }

    return { ok: true };
  });

/**
 * Ingest a PDF whose original file has already been uploaded
 * to Supabase Storage by the authenticated client.
 * The server validates ownership, chunks and embeds the text,
 * and stores the document record and indexed text.
 */
export const ingestPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        text: z.string().min(20).max(2_000_000),
        pageCount: z.number().int().min(1).max(2000),
        sizeBytes: z.number().int().min(1).max(15 * 1024 * 1024),
        storagePath: z.string().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const expectedPath = `${context.userId}/${data.id}.pdf`;

    if (data.storagePath !== expectedPath) {
      throw new Error("Invalid PDF storage path.");
    }

    const { chunkText, embedTexts } = await import("./embed.server");
    const chunks = chunkText(data.text);

    if (chunks.length === 0) {
      throw new Error("Could not extract text from PDF.");
    }

    const { data: doc, error: insertError } = await context.supabase
      .from("documents")
      .insert({
        id: data.id,
        user_id: context.userId,
        title: data.title,
        storage_path: data.storagePath,
        size_bytes: data.sizeBytes,
        page_count: data.pageCount,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertError || !doc) {
      throw new Error(
        insertError?.message ?? "Could not create the document record.",
      );
    }

    try {
      const batchSize = 32;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const vectors = await embedTexts(batch);

        if (vectors.length !== batch.length) {
          throw new Error("Embedding service returned an incomplete result.");
        }

        const rows = batch.map((content, j) => ({
          document_id: doc.id,
          user_id: context.userId,
          chunk_index: i + j,
          content,
          embedding: vectors[j] as unknown as string,
        }));

        const { error: chunksError } = await context.supabase
          .from("document_chunks")
          .insert(rows);

        if (chunksError) {
          throw new Error(
            `Could not save indexed PDF text: ${chunksError.message}`,
          );
        }
      }

      const { error: readyError } = await context.supabase
        .from("documents")
        .update({ status: "ready" })
        .eq("id", doc.id)
        .eq("user_id", context.userId);

      if (readyError) {
        throw new Error(
          `Could not mark the PDF as ready: ${readyError.message}`,
        );
      }

      return { id: doc.id, chunkCount: chunks.length };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error";

      await context.supabase
        .from("documents")
        .update({
          status: "error",
          error: message.slice(0, 500),
        })
        .eq("id", doc.id)
        .eq("user_id", context.userId);

      throw error;
    }
  });
