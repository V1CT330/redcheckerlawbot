import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateApiKey, sha256Hex } from "@/lib/api-key-crypto";

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("developer_api_keys")
      .select("id,name,key_prefix,created_at,last_used_at,revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const key = generateApiKey();
    const keyHash = await sha256Hex(key);
    const keyPrefix = key.slice(0, 12);

    const { data: row, error } = await context.supabase
      .from("developer_api_keys")
      .insert({ user_id: context.userId, name: data.name, key_prefix: keyPrefix, key_hash: keyHash })
      .select("id,name,key_prefix,created_at")
      .single();
    if (error) throw new Error(error.message);

    // The full key is returned exactly once — it is not recoverable later.
    return { ...row, key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("developer_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.keyId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
