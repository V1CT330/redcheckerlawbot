import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { forkSharedChat, getSharedChat } from "@/lib/share.functions";
import type { UIMessage } from "ai";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitFork } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { MessageCopyButton } from "@/components/message-copy-button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/share/$shareId")({
  component: SharedChatView,
  head: ({ params }) => ({
    meta: [
      { title: `Shared conversation · RedBot Law Checker` },
      { name: "description", content: "A shared RedBot Law Checker conversation about Malawian law." },
      { property: "og:title", content: "Shared conversation · RedBot Law Checker" },
      { property: "og:description", content: "A shared RedBot Law Checker conversation about Malawian law." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: `/share/${params.shareId}` }],
  }),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="font-serif text-2xl font-bold">Shared chat not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      <Link to="/" className="mt-6 inline-block text-primary underline">Go home</Link>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function SharedChatView() {
  const { shareId } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getSharedChat);
  const fork = useServerFn(forkSharedChat);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
  }, []);

  const q = useQuery({
    queryKey: ["shared-chat", shareId],
    queryFn: () => get({ data: { shareId } }),
  });

  const forkM = useMutation({
    mutationFn: () => fork({ data: { shareId } }),
    onSuccess: (r) => navigate({ to: "/chat/$threadId", params: { threadId: r.threadId } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not fork"),
  });

  if (q.isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!q.data) return null;

  const messages = JSON.parse(q.data.messagesJson) as UIMessage[];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandLogo className="w-12 sm:w-14" />
            <span className="min-w-0 font-serif text-xl font-bold leading-tight sm:text-2xl">RedBot Law Checker</span>
          </Link>
          {isAuthed ? (
            <Button onClick={() => forkM.mutate()} disabled={forkM.isPending} size="sm">
              <GitFork className="mr-1.5 h-3.5 w-3.5" />
              Continue this chat
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/auth">
                Sign in to continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-serif text-2xl font-bold">{q.data.title}</h1>
        <p className="mb-6 text-xs text-muted-foreground">
          Shared conversation · {new Date(q.data.createdAt).toLocaleDateString()} · read-only
        </p>
        <div className="space-y-4">
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.role === "assistant" ? (
                  <MessageResponse>
                    {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                  </MessageResponse>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                  </div>
                )}
              </MessageContent>
              <MessageCopyButton from={m.role} text={m.parts.map((p) => p.type === "text" ? p.text : "").join("")} />
            </Message>
          ))}
        </div>
        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          RedBot Law Checker can be wrong. For binding advice, consult a lawyer registered with the
          Malawi Law Society (Legal Aid: 847).
        </p>
      </main>
    </div>
  );
}
