
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteDocument,
  ingestPdf,
  listDocuments,
} from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

async function extractPdf(
  file: File,
): Promise<{ text: string; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text, totalPages } = await extractText(pdf, {
    mergePages: true,
  });

  return {
    text: Array.isArray(text) ? text.join("\n\n") : text,
    pageCount: totalPages,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve((reader.result as string).split(",")[1] ?? "");
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function DocumentsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listDocuments);
  const ingest = useServerFn(ingestPdf);
  const del = useServerFn(deleteDocument);
  const inputRef = useRef<HTMLInputElement>(null);

  const docsQ = useQuery({
    queryKey: ["documents"],
    queryFn: () => list(),
  });

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        throw new Error("Please select a PDF file.");
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new Error("PDF must be under 15 MB.");
      }

      if (file.size === 0) {
        throw new Error("The selected PDF is empty.");
      }

      const { text, pageCount } = await extractPdf(file);

      if (!text.trim() || text.trim().length < 20) {
        throw new Error(
          "No readable text found. This PDF may be scanned or image-only.",
        );
      }

      const fileBase64 = await fileToBase64(file);

      return ingest({
        data: {
          title: file.name.replace(/\.pdf$/i, ""),
          text,
          pageCount,
          fileBase64,
        },
      });
    },

    onSuccess: () => {
      toast.success("PDF added to your legal library.");
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },

    onError: (error) => {
      console.error("PDF library upload failed:", error);
      toast.error(
        error instanceof Error ? error.message : "PDF upload failed.",
      );
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),

    onSuccess: () => {
      toast.success("Document deleted.");
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },

    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete document.",
      );
    },
  });

  const busy = uploadM.isPending;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";

            if (file) uploadM.mutate(file);
          }}
        />

        <Button
          type="button"
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          disabled={busy}
          className="w-full"
          size="sm"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Processing PDF…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Upload PDF
            </>
          )}
        </Button>

        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Upload contracts, judgments and statutes for document indexing.
          Maximum file size: 15 MB.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {docsQ.isLoading && (
          <p className="p-2 text-xs text-muted-foreground">
            Loading documents…
          </p>
        )}

        {docsQ.isError && (
          <div className="p-2 text-xs text-destructive">
            <p>Could not load your documents.</p>
            <p className="mt-1 break-words">
              Error:{" "}
              {docsQ.error instanceof Error
                ? docsQ.error.message
                : String(docsQ.error)}
            </p>
            <button
              type="button"
              className="mt-1 underline"
              onClick={() => void docsQ.refetch()}
            >
              Try again
            </button>
          </div>
        )}

        {docsQ.data?.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            No PDFs uploaded yet.
          </p>
        )}

        <ul className="space-y-1">
          {docsQ.data?.map((document) => (
            <li
              key={document.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-xs font-medium"
                  title={document.title}
                >
                  {document.title}
                </p>

                <p className="text-[10px] text-muted-foreground">
                  {document.status === "ready"
                    ? `${document.page_count ?? "?"} pages`
                    : document.status}
                </p>
              </div>

              <button
                type="button"
                disabled={deleteM.isPending}
                onClick={() => {
                  if (
                    !deleteM.isPending &&
                    confirm(
                      `Delete "${document.title}"? This cannot be undone.`,
                    )
                  ) {
                    deleteM.mutate(document.id);
                  }
                }}
                aria-label={`Delete ${document.title}`}
                title="Delete document"
                className="rounded p-1 hover:bg-destructive/10 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                {deleteM.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
