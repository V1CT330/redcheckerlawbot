import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .inputValidator((d: unknown) => z.object({ title: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("threads")
      .insert({ user_id: context.userId, title: data.title ?? "New chat" })
      .select("id,title,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(120) }).parse(d),
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
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
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
    z
      .object({
        threadId: z.string().uuid(),
        userMessage: z.any(),
        assistantMessage: z.any(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify ownership
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
    const { error } = await context.supabase.from("messages").insert(rows);
    if (error) throw new Error(error.message);

    // Auto-title from first user message if still default
    if (thread.title === "New chat") {
      const parts = (data.userMessage?.parts ?? []) as Array<{ type: string; text?: string }>;
      const firstText = parts.find((p) => p.type === "text")?.text ?? "";
      const newTitle = firstText.slice(0, 60).trim() || "New chat";
      await context.supabase
        .from("threads")
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", data.threadId);
    } else {
      await context.supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.threadId);
    }
    return { ok: true };
  });
