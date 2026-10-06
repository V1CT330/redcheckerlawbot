import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createThread, listThreads } from "@/lib/threads.functions";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({ meta: [
    { title: "Your Chats | RedBot Law Checker" },
    { name: "description", content: "Open your saved legal conversations with RedBot Law Checker." },
    { property: "og:title", content: "Your Chats | RedBot Law Checker" },
    { property: "og:description", content: "Open your saved legal conversations with RedBot Law Checker." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const qc = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const threads = await list();
        if (threads.length > 0) {
          navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
          return;
        }
        const t = await create({ data: {} });
        qc.invalidateQueries({ queryKey: ["threads"] });
        if (t?.id) navigate({ to: "/chat/$threadId", params: { threadId: t.id }, replace: true });
      } catch (err) {
        console.error(err);
      }
    })();
  }, [list, create, navigate, qc]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <BrandLogo className="w-8" />
        <span>Loading RedBot Law Checker…</span>
      </div>
    </div>
  );
}
