import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getThreadMessages, saveTurn } from "@/lib/threads.functions";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Scale } from "lucide-react";
import logo from "@/assets/red-checker-logo.png";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ChatThread,
});

const SUGGESTIONS = [
  "What are my rights if I am arrested in Malawi?",
  "How do I register a small business under the Companies Act 2013?",
  "Explain inheritance rights for a widow under Malawian law.",
  "What does the Constitution say about freedom of expression?",
];

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
      onSave={async (u, a) => {
        try {
          await save({ data: { threadId, userMessage: u, assistantMessage: a } });
          qc.invalidateQueries({ queryKey: ["threads"] });
        } catch (e) {
          console.error(e);
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedIdsRef = useRef<Set<string>>(new Set(initial.map((m) => m.id)));

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (err) => toast.error(err.message || "Something went wrong"),
  });

  // Persist completed turns
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || savedIdsRef.current.has(last.id)) return;
    // find prior user
    const priorUser = [...messages].reverse().find((m) => m.role === "user");
    if (!priorUser || savedIdsRef.current.has(priorUser.id)) return;
    savedIdsRef.current.add(priorUser.id);
    savedIdsRef.current.add(last.id);
    void onSave(priorUser, last);
  }, [status, messages, onSave]);

  // Focus textarea after mount, after send, after stream finish
  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status, threadId]);

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    void sendMessage({ text });
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<img src={logo} alt="" width={56} height={56} className="h-14 w-14" />}
              title="Ask Red Checker about Malawi law"
              description="From the Constitution to Acts of Parliament and public policies — get plain-language answers with citations."
            >
              <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      void sendMessage({ text: s });
                    }}
                    className="rounded-lg border bg-card p-3 text-left text-sm text-foreground shadow-sm transition hover:border-primary hover:bg-primary/5"
                  >
                    <Scale className="mb-2 h-4 w-4 text-primary" />
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.role === "assistant" ? (
                    <MessageResponse>
                      {m.parts
                        .map((p) => (p.type === "text" ? p.text : ""))
                        .join("")}
                    </MessageResponse>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {m.parts
                        .map((p) => (p.type === "text" ? p.text : ""))
                        .join("")}
                    </div>
                  )}
                </MessageContent>
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

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl p-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a section of the Constitution, an Act, your rights…"
              autoFocus
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!input.trim() && !isBusy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Red Checker can be wrong. For binding advice, consult a lawyer registered with the
            Malawi Law Society (Legal Aid: 847).
          </p>
        </div>
      </div>
    </div>
  );
}
