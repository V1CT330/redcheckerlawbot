
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteDocument, ingestPdf, listDocuments } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

async function extractPdf(file: File): Promise<{ text: string; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });

  return {
    text: Array.isArray(text) ? text.join("\n\n") : text,
    pageCount: totalPages,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
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
  const [busy, setBusy] = useState(false);

  const docsQ = useQuery({
    queryKey: ["documents"],
    queryFn: () => list(),
  });

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        throw new Error("PDF must be under 15 MB.");
      }

      const { text, pageCount } = await extractPdf(file);
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
      toast.success("PDF added to your legal library");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    },
    onSettled: () => setBusy(false),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not delete document");
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";

            if (!file) return;

            setBusy(true);
            uploadM.mutate(file);
          }}
        />

        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full"
          size="sm"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Upload PDF
            </>
          )}
        </Button>

        <p className="mt-1.5 text-[10px] text-muted-foreground">
          The bot will search your contracts, judgments and statutes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {docsQ.isLoading && (
          <p className="p-2 text-xs text-muted-foreground">Loading…</p>
        )}

        {docsQ.isError && (
          <p className="p-2 text-xs text-destructive">
            Could not load your documents. Please try again.
          </p>
        )}

        {docsQ.data?.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">No PDFs yet.</p>
        )}

        <ul className="space-y-1">
          {docsQ.data?.map((d) => (
            <li
              key={d.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={d.title}>
                  {d.title}
                </p>

                <p className="text-[10px] text-muted-foreground">
                  {d.status === "ready"
                    ? `${d.page_count ?? "?"} pages`
                    : d.status}
                </p>
              </div>

              <button
                type="button"
                disabled={deleteM.isPending}
                onClick={() => {
                  if (deleteM.isPending) return;

                  if (confirm(`Delete "${d.title}"? This cannot be undone.`)) {
                    deleteM.mutate(d.id);
                  }
                }}
                aria-label={`Delete ${d.title}`}
                title="Delete document"
                className="rounded p-1 opacity-100 transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                {deleteM.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
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
