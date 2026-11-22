import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: thread, error: tErr } = await context.supabase
      .from("threads")
      .select("id,title")
      .eq("id", data.threadId)
      .single();
    if (tErr || !thread) throw new Error("Thread not found");

    const { data: rows, error: mErr } = await context.supabase
      .from("messages")
      .select("message")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    // The owner and messages were verified with the caller's RLS-scoped client.
    // Use the server-only admin client for the insert because public SELECT access
    // to shared_chats is intentionally disabled.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error: sErr } = await supabaseAdmin
      .from("shared_chats")
      .insert({
        thread_id: data.threadId,
        owner_id: context.userId,
        title: thread.title,
        messages: (rows ?? []).map((r) => r.message) as unknown as never,
      })
      .select("id")
      .single();
    if (sErr || !share) throw new Error(sErr?.message ?? "Share failed");
    return { id: share.id };
  });

export const getSharedChat = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ shareId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("shared_chats")
      .select("id,title,messages,created_at")
      .eq("id", data.shareId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Shared chat not found");
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      messagesJson: JSON.stringify(row.messages ?? []),
    };
  });

export const forkSharedChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shareId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin
      .from("shared_chats")
      .select("title,messages")
      .eq("id", data.shareId)
      .maybeSingle();
    if (error || !share) throw new Error("Shared chat not found");

    const { data: thread, error: tErr } = await context.supabase
      .from("threads")
      .insert({ user_id: context.userId, title: `${share.title} (forked)` })
      .select("id")
      .single();
    if (tErr || !thread) throw new Error(tErr?.message ?? "Fork failed");

    const msgs = (share.messages ?? []) as Array<{ role: string }>;
    if (msgs.length > 0) {
      const rows = msgs.map((m) => ({
        thread_id: thread.id,
        user_id: context.userId,
        role: m.role,
        message: m as unknown as never,
      }));
      const { error: iErr } = await context.supabase.from("messages").insert(rows);
      if (iErr) throw new Error(iErr.message);
    }
    return { threadId: thread.id };
  });
