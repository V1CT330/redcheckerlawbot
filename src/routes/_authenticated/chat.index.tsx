import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createThread, listThreads } from "@/lib/threads.functions";
import logo from "@/assets/red-checker-logo.png";

export const Route = createFileRoute("/_authenticated/chat/")({
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
        <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
        <span>Loading Red Checker…</span>
      </div>
    </div>
  );
}
