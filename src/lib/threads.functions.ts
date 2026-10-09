import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function createShortChatTitle(message: string): string {
  const text = message
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "New chat";

  const patterns: Array<[RegExp, string]> = [
    [/\b(employment contracts?|work contracts?)\b/i, "Employment Contracts"],
    [/\b(unfair dismissal|wrongful dismissal|unfairly dismissed)\b/i, "Unfair Dismissal"],
    [/\b(theft|stealing|stole)\b/i, "Theft Law"],
    [/\b(rental agreement|rent agreement|tenancy agreement|lease agreement)\b/i, "Rental Agreement"],
    [/\b(labour law|labor law|employment law)\b/i, "Employment Law"],
    [/\b(family law|divorce|child custody)\b/i, "Family Law"],
    [/\b(breach of contract|contract law)\b/i, "Contract Law"],
    [/\b(defamation|libel|slander)\b/i, "Defamation Law"],
  ];

  for (const [pattern, title] of patterns) {
    if (pattern.test(text)) return title;
  }

  const section = text.match(
    /\bconstitution\b.*\bsection\s+(\d+[a-z]?)\b/i,
  );

  if (section) {
    return `Constitution: Section ${section[1]}`;
  }

  const cleaned = text
    .replace(
      /^(please\s+)?(can you|could you|help me|explain to me|explain|tell me|what is|what are|how do i|how does|how can i|how to|what happens if)\s+/i,
      "",
    )
    .replace(/[?!.,;:]+$/g, "")
    .trim();

  const ignored = new Set([
    "a", "an", "the", "is", "are", "do", "does", "did",
    "can", "could", "would", "should", "i", "me", "my",
    "you", "your", "please", "help", "explain", "tell",
    "what", "when", "where", "why", "who", "how", "about",
    "want", "need", "know", "understand", "someone",
  ]);

  const words = cleaned
    .split(/\s+/)
    .filter((word) => word && !ignored.has(word.toLowerCase()))
    .slice(0, 5);

  if (!words.length) {
    return cleaned.split(/\s+/).slice(0, 4).join(" ") || "New chat";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ title: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("threads")
      .insert({
        user_id: context.userId,
        title: data.title ?? "New chat",
      })
      .select("id,title,updated_at")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .delete()
      .eq("id", data.threadId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      threadId: z.string().uuid(),
      title: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title })
      .eq("id", data.threadId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ json: string }> => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("message")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return { json: JSON.stringify((rows ?? []).map((r) => r.message)) };
  });

export const saveTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      threadId: z.string().uuid(),
      userMessage: z.any(),
      assistantMessage: z.any(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify that the thread exists.
    const { data: thread, error: tErr } = await context.supabase
      .from("threads")
      .select("id,title")
      .eq("id", data.threadId)
      .single();

    if (tErr || !thread) throw new Error("Thread not found");

    const rows = [
      {
        thread_id: data.threadId,
        user_id: context.userId,
        role: "user",
        message: data.userMessage,
      },
      {
        thread_id: data.threadId,
        user_id: context.userId,
        role: "assistant",
        message: data.assistantMessage,
      },
    ];

    const { error } = await context.supabase
      .from("messages")
      .insert(rows);

    if (error) throw new Error(error.message);

    // Generate a short title only for chats still using the default title.
    const now = new Date().toISOString();

    if (thread.title === "New chat") {
      const parts = (data.userMessage?.parts ?? []) as Array<{
        type: string;
        text?: string;
      }>;

      const firstText =
        parts.find((part) => part.type === "text")?.text ?? "";

      const newTitle = createShortChatTitle(firstText);

      const { error: titleError } = await context.supabase
        .from("threads")
        .update({ title: newTitle, updated_at: now })
        .eq("id", data.threadId);

      if (titleError) throw new Error(titleError.message);
    } else {
      const { error: updateError } = await context.supabase
        .from("threads")
        .update({ updated_at: now })
        .eq("id", data.threadId);

      if (updateError) throw new Error(updateError.message);
    }

    return { ok: true };
  });
