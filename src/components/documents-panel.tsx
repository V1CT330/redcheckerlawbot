
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteDocument,
  listDocuments,
} from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function DocumentsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listDocuments);
  const del = useServerFn(deleteDocument);

  const docsQ = useQuery({
    queryKey: ["documents"],
    queryFn: () => list(),
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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <p className="text-xs text-muted-foreground">
          Your uploaded legal documents appear here. Upload PDFs from the chat
          window.
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

              <Button
                type="button"
                variant="ghost"
                size="icon"
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
                className="h-7 w-7 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                {deleteM.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
              }
