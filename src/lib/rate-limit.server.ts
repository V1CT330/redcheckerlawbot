// Best-effort fallback for environments where the shared database rate-limit
// migration has not been applied yet. The database RPC remains authoritative
// whenever available; this in-memory fallback is per runtime instance only.
type Bucket = { windowStartedAt: number; count: number };

const buckets = new Map<string, Bucket>();

export function consumeLocalRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): boolean {
  const now = Date.now();
  const key = `${bucket}:${identifier}`;
  const current = buckets.get(key);

  if (!current || now - current.windowStartedAt >= windowSeconds * 1000) {
    buckets.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }

  current.count += 1;
  return current.count <= limit;
}
