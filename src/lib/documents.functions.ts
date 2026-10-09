export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Find only a document belonging to the signed-in user.
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
      throw new Error("Document not found or you do not have permission to delete it.");
    }

    // Remove the original PDF first. Stop if storage reports an error.
    if (doc.storage_path) {
      const { error: storageError } = await context.supabase.storage
        .from("law-pdfs")
        .remove([doc.storage_path]);

      if (storageError) {
        throw new Error(`Could not delete the original PDF: ${storageError.message}`);
      }
    }

    // Delete the associated indexed text chunks.
    const { error: chunksError } = await context.supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", doc.id)
      .eq("user_id", context.userId);

    if (chunksError) {
      throw new Error(`PDF file removed, but its indexed text could not be deleted: ${chunksError.message}`);
    }

    // Delete the document record.
    const { data: deleted, error: deleteError } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", doc.id)
      .eq("user_id", context.userId)
      .select("id");

    if (deleteError) {
      throw new Error(`PDF file removed, but the document record could not be deleted: ${deleteError.message}`);
    }

    if (!deleted?.length) {
      throw new Error("PDF file removed, but the document record was not deleted.");
    }

    return { ok: true };
  });
      
