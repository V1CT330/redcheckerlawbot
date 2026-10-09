import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getThreadMessages, saveTurn } from "@/lib/threads.functions";
import { ingestPdf } from "@/lib/documents.functions";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Scale, Plus, LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { MessageCopyButton } from "@/components/message-copy-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Legal Conversation | RedBot Law Checker" },
      {
        name: "description",
        content:
          "Your private conversation about Malawi law with RedBot Law Checker.",
      },
      {
        property: "og:title",
        content: "Legal Conversation | RedBot Law Checker",
      },
      {
        property: "og:description",
        content:
          "Your private conversation about Malawi law with RedBot Law Checker.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatThread,
});

const SUGGESTIONS = [
  "What are my rights if I am arrested in Malawi?",
  "How do I register a small business under the Companies Act 2013?",
  "Explain inheritance rights for a widow under Malawian law.",
  "What does the Constitution say about freedom of expression?",
];

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
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ChatThread() {
  const { threadId } = Route.useParams();
  const qc = useQueryClient();

  const load = useServerFn(getThreadMessages);
  const save = useServerFn(saveTurn);

  const initialQ = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: () => load({ data: { threadId } }),
  });

  if (initialQ.isLoading || !initialQ.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      initial={(JSON.parse(initialQ.data.json) as UIMessage[]) ?? []}
      onSave={async (userMessage, assistantMessage) => {
        try {
          await save({
            data: {
              threadId,
              userMessage,
              assistantMessage,
            },
          });
          await qc.invalidateQueries({ queryKey: ["threads"] });
        } catch (error) {
          console.error("Could not save chat messages:", error);
        }
      }}
    />
  );
}

function ChatWindow({
  threadId,
  initial,
  onSave,
}: {
  threadId: string;
  initial: UIMessage[];
  onSave: (userMsg: UIMessage, assistantMsg: UIMessage) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedIdsRef = useRef<Set<string>>(
    new Set(initial.map((message) => message.id)),
  );

  const uploadPdf = useServerFn(ingestPdf);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
    onError: (error) => {
      console.error("Chat request failed:", error);
      toast.error(error.message || "Something went wrong.");
    },
  });

  useEffect(() => {
    if (status !== "ready") return;

    const lastMessage = messages[messages.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "assistant" ||
      savedIdsRef.current.has(lastMessage.id)
    ) {
      return;
    }

    const previousUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (
      !previousUserMessage ||
      savedIdsRef.current.has(previousUserMessage.id)
    ) {
      return;
    }

    savedIdsRef.current.add(previousUserMessage.id);
    savedIdsRef.current.add(lastMessage.id);
    void onSave(previousUserMessage, lastMessage);
  }, [status, messages, onSave]);

  useEffect(() => {
    if (status === "ready") {
      textareaRef.current?.focus();
    }
  }, [status, threadId]);

  const handleSubmit = (message: PromptInputMessage) => {
    const text = (message.text ?? "").trim();

    if (!text) return;

    void sendMessage({ text });
    setInput("");
  };

  const openPdfPicker = () => {
    if (uploadingPdf) return;

    const fileInput = fileInputRef.current;

    if (!fileInput) {
      toast.error("The file picker is unavailable. Please reload the page.");
      return;
    }

    // Keep the file picker opening directly from the user's tap.
    fileInput.click();
  };

  const handlePdfSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Please select a PDF file.");
      return;
    }

    if (file.size === 0) {
      toast.error("The selected PDF is empty.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error("PDF must be under 15 MB.");
      return;
    }

    setUploadingPdf(true);

    try {
      const { text, pageCount } = await extractPdf(file);

      if (!text.trim() || text.trim().length < 20) {
        throw new Error(
          "No readable text found. This PDF may be scanned or image-only.",
        );
      }

      const fileBase64 = await fileToBase64(file);

      await uploadPdf({
        data: {
          title: file.name.replace(/\.pdf$/i, ""),
          text,
          pageCount,
          fileBase64,
        },
      });

      toast.success(
        "PDF added to your legal library. You can now ask RedBot about it.",
      );
    } catch (error) {
      console.error("Chat PDF upload failed:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Could not process the PDF.",
      );
    } finally {
      setUploadingPdf(false);
    }
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<BrandLogo className="w-12" />}
              title="Ask RedBot Law Checker about Malawi law"
              description="Get plain-language answers with citations, from the Constitution to Acts of Parliament and public policies."
            >
              <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      void sendMessage({ text: suggestion });
                    }}
                    className="rounded-lg border bg-card p-3 text-left text-sm text-foreground shadow-sm transition hover:border-primary hover:bg-primary/5"
                  >
                    <Scale className="mb-2 h-4 w-4 text-primary" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.role === "assistant" ? (
                    <MessageResponse>
                      {message.parts
                        .map((part) =>
                          part.type === "text" ? part.text : "",
                        )
                        .join("")}
                    </MessageResponse>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {message.parts
                        .map((part) =>
                          part.type === "text" ? part.text : "",
                        )
                        .join("")}
                    </div>
                  )}
                </MessageContent>

                <MessageCopyButton
                  from={message.role}
                  text={message.parts
                    .map((part) =>
                      part.type === "text" ? part.text : "",
                    )
                    .join("")}
                />
              </Message>
            ))
          )}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Consulting the Constitution…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl p-3 sm:p-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a section of the Constitution, an Act, your rights…"
              autoFocus
            />

            <PromptInputFooter className="justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choose a PDF to attach"
                  onChange={handlePdfSelected}
                />

                <button
                  type="button"
                  onClick={openPdfPicker}
                  disabled={uploadingPdf}
                  aria-label="Attach PDF"
                  title="Attach PDF"
                  className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingPdf ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                  <span className="hidden xs:inline">
                    {uploadingPdf ? "Processing…" : "Attach PDF"}
                  </span>
                </button>

                {uploadingPdf && (
                  <span className="truncate text-xs text-muted-foreground">
                    Processing PDF…
                  </span>
                )}
              </div>

              <PromptInputSubmit
                status={status}
                disabled={!input.trim() && !isBusy}
              />
            </PromptInputFooter>
          </PromptInput>

          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            RedBot Law Checker can be wrong. For binding advice, consult a
            lawyer registered with the Malawi Law Society (Legal Aid: 847).
          </p>
        </div>
      </div>
    </div>
  );
  }
