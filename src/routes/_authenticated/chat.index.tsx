import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createThread, listThreads } from "@/lib/threads.functions";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/_authenticated/chat/")({
head: () => ({
meta: [
{ title: "Your Chats | RedBot Law Checker" },
{
name: "description",
content: "Open your saved legal conversations with RedBot Law Checker.",
},
{ property: "og:title", content: "Your Chats | RedBot Law Checker" },
{
property: "og:description",
content: "Open your saved legal conversations with RedBot Law Checker.",
},
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" },
],
}),
component: ChatIndex,
});

function ChatIndex() {
const navigate = useNavigate();
const list = useServerFn(listThreads);
const create = useServerFn(createThread);
const qc = useQueryClient();

const started = useRef(false);
const [loading, setLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState("");

const openChat = useCallback(async () => {
setLoading(true);
setErrorMessage("");

try {
  const threads = await list();

  if (threads.length > 0) {
    await navigate({
      to: "/chat/$threadId",
      params: { threadId: threads[0].id },
      replace: true,
    });
    return;
  }

  const thread = await create({ data: {} });

  if (!thread?.id) {
    throw new Error("A new chat could not be created. Please try again.");
  }

  await qc.invalidateQueries({ queryKey: ["threads"] });

  await navigate({
    to: "/chat/$threadId",
    params: { threadId: thread.id },
    replace: true,
  });
} catch (error) {
  console.error("Failed to load or create a chat:", error);

  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Something went wrong while opening your chats.",
  );
  setLoading(false);
}

}, [list, create, navigate, qc]);

useEffect(() => {
if (started.current) return;
started.current = true;
void openChat();
}, [openChat]);

if (!loading) {
return (
<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
<BrandLogo className="w-10" />

    <h2 className="text-lg font-semibold">
      Couldn't open your chat
    </h2>

    <p className="max-w-md text-sm text-muted-foreground">
      {errorMessage}
    </p>

    <button
      type="button"
      onClick={() => void openChat()}
      className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
    >
      Try again
    </button>
  </div>
);

}

return (
<div className="flex h-full items-center justify-center">
<div className="flex items-center gap-3 text-muted-foreground">
<BrandLogo className="w-8" />
<span>Loading RedBot Law Checker…</span>
</div>
</div>
);
}
