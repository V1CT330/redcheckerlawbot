import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const CURL_SNIPPET = `curl -X POST https://YOUR-REDBOT-URL/api/public/v1/ask \\
  -H "Authorization: Bearer rlb_sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is the notice period for terminating an employee in Malawi?"}'`;

export function DevelopersPanel() {
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);

  const keysQ = useQuery({ queryKey: ["api-keys"], queryFn: () => list() });

  const createM = useMutation({
    mutationFn: (name: string) => create({ data: { name } }),
    onSuccess: (row) => {
      setNewKey(row.key);
      setKeyName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create key"),
  });

  const revokeM = useMutation({
    mutationFn: (keyId: string) => revoke({ data: { keyId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke key"),
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 text-xs">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Developer API</h3>
      </div>
      <p className="mb-3 leading-snug text-muted-foreground">
        Let other apps ask RedBot Malawi law questions with one HTTP call. Create a key, then send
        it as a bearer token.
      </p>

      {/* Create key */}
      <div className="mb-4 flex gap-1.5">
        <Input
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="Key name (e.g. My app)"
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          className="h-8 shrink-0"
          disabled={!keyName.trim() || createM.isPending}
          onClick={() => createM.mutate(keyName.trim())}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Create
        </Button>
      </div>

      {/* New key one-time reveal */}
      {newKey && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-2.5">
          <p className="mb-1.5 font-medium">
            Copy your key now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[11px]">{newKey}</code>
            <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => copy(newKey, "API key")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="mb-4 space-y-1.5">
        {keysQ.isLoading && <p className="text-muted-foreground">Loading keys…</p>}
        {keysQ.data?.length === 0 && !newKey && (
          <p className="text-muted-foreground">No API keys yet. Create one above.</p>
        )}
        {keysQ.data?.map((k: ApiKeyRow) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-2 rounded-md border p-2"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{k.name}</p>
              <p className="text-[11px] text-muted-foreground">
                <code>{k.key_prefix}…</code>
                {" · "}
                {k.revoked_at ? (
                  <span className="text-destructive">revoked</span>
                ) : k.last_used_at ? (
                  <>last used {new Date(k.last_used_at).toLocaleDateString()}</>
                ) : (
                  "never used"
                )}
              </p>
            </div>
            {!k.revoked_at && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Revoke "${k.name}"? Apps using it will stop working.`)) {
                    revokeM.mutate(k.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Usage docs */}
      <div className="rounded-md border p-2.5">
        <p className="mb-1.5 font-semibold uppercase tracking-wider text-muted-foreground">
          Endpoint
        </p>
        <p className="mb-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">POST /api/public/v1/ask</code>
        </p>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
          {CURL_SNIPPET}
        </pre>
        <p className="mt-2 leading-snug text-muted-foreground">
          Response: <code className="text-[11px]">{`{ "answer": "…" }`}</code>. Rate limits and
          fair-use apply; keep one key per app and revoke any key that leaks.
        </p>
      </div>
    </div>
  );
}
