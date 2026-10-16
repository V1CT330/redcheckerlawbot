import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  MALAWI_LAW_DOMAINS,
  MALAWI_LAW_LINKS,
  type LawLink,
} from "@/lib/malawi-law-links";

const MAX_CONTENT_LENGTH = 100_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_DISCOVERED_DOCUMENTS = 12;
const MIN_READABLE_TEXT = 300;

type DocumentType =
  | "constitution"
  | "act"
  | "regulation"
  | "judgment"
  | "policy"
  | "other";

type CollectedDocument = {
  title: string;
  source_url: string;
  source_domain: string;
  document_type: DocumentType;
  content: string;
  content_hash: string;
  source_updated_at: string | null;
  last_crawled_at: string;
  is_current: boolean;
};

type CollectionItem = LawLink;

function approvedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");

  return MALAWI_LAW_DOMAINS.some((domain) => {
    const approvedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    return (
      normalized === approvedDomain ||
      normalized.endsWith(`.${approvedDomain}`)
    );
  });
}

function isApprovedSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && approvedHostname(url.hostname);
  } catch {
    return false;
  }
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value: string) => {
      const codePoint = Number(value);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => {
      const codePoint = parseInt(value, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : " ";
    });
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|nav|footer|header|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return fallback;
  return htmlToText(match[1]).slice(0, 300) || fallback;
}

function getDocumentType(category: string, url: string): DocumentType {
  if (category === "constitution" || /constitution/i.test(url)) return "constitution";
  if (category === "cases" || /judg(?:e)?ments?/i.test(url)) return "judgment";
  if (/regulations?/i.test(url)) return "regulation";
  if (category === "acts" || /\/akn\/mw\/act\//i.test(url) || /\/acts?\//i.test(url)) return "act";
  if (category === "policy" || category === "help") return "policy";
  return "other";
}

function titleFromUrl(url: URL): string {
  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "Malawi legal document");
  return last
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 300);
}

function categoryFromUrl(url: URL): LawLink["category"] {
  if (/constitution/i.test(url.pathname)) return "constitution";
  if (/judg(?:e)?ments?/i.test(url.pathname)) return "cases";
  if (/\/akn\/mw\/act\/|\/acts?\//i.test(url.pathname)) return "acts";
  return "policy";
}

function isDocumentCandidate(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!isApprovedSource(url.toString())) return false;

    const path = url.pathname.toLowerCase();
    const isPdf = path.endsWith(".pdf");
    const isLegislation =
      /\/akn\/mw\/(act|bill|regulation)\//i.test(path) ||
      /\/(acts?|legislation|laws|statutes|regulations)\//i.test(path);
    const isJudgment = /\/(judgments?|cases)\//i.test(path);
    return isPdf || isLegislation || isJudgment;
  } catch {
    return false;
  }
}

function discoverLinks(html: string, baseUrl: string): CollectionItem[] {
  const discovered: CollectionItem[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;

    try {
      const url = new URL(rawHref, baseUrl);
      url.hash = "";
      if (!isDocumentCandidate(url.toString())) continue;

      const normalizedUrl = url.toString();
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);

      const anchorTitle = htmlToText(match[4] ?? "").slice(0, 200);
      const title = anchorTitle || titleFromUrl(url);
      const category = categoryFromUrl(url);

      discovered.push({
        title,
        url: normalizedUrl,
        description: "Discovered from an approved Malawian legal source; verify current legal status and amendments.",
        category,
      });
    } catch {
      // Ignore malformed links without interrupting the collection run.
    }
  }

  return discovered;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new Error(`Source response exceeds the ${maxBytes} byte limit.`);
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Response size limit exceeded.");
        throw new Error(`Source response exceeds the ${maxBytes} byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const combined = Array.isArray(text) ? text.join("\n\n") : text;
  return combined.trim().slice(0, MAX_CONTENT_LENGTH);
}

async function collectPage(item: CollectionItem): Promise<{
  document: CollectedDocument | null;
  discovered: CollectionItem[];
}> {
  if (!isApprovedSource(item.url)) {
    console.warn(`[legal-collector] Skipping unapproved URL: ${item.url}`);
    return { document: null, discovered: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(item.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.1",
        "User-Agent": "RedBotLegalLibrary/1.0 (+https://redcheckerlawbot.vercel.app)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[legal-collector] HTTP ${response.status}: ${item.url}`);
      return { document: null, discovered: [] };
    }

    if (!isApprovedSource(response.url)) {
      console.warn(`[legal-collector] Rejected redirected URL: ${response.url}`);
      return { document: null, discovered: [] };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const finalUrl = new URL(response.url);
    const isPdf = contentType.includes("application/pdf") || finalUrl.pathname.toLowerCase().endsWith(".pdf");

    let content = "";
    let title = item.title;
    let discovered: CollectionItem[] = [];

    if (isPdf) {
      const bytes = await readLimitedBody(response, MAX_PDF_BYTES);
      if (bytes.byteLength < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
        console.warn(`[legal-collector] Invalid PDF response: ${item.url}`);
        return { document: null, discovered: [] };
      }
      content = await extractPdfText(bytes);
      title = titleFromUrl(finalUrl) || item.title;
    } else if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
      const bytes = await readLimitedBody(response, MAX_HTML_BYTES);
      const html = new TextDecoder("utf-8").decode(bytes);
      content = htmlToText(html);
      title = extractTitle(html, item.title);
      discovered = discoverLinks(html, response.url);
    } else {
      console.warn(`[legal-collector] Skipping unsupported content type: ${item.url}`);
      return { document: null, discovered: [] };
    }

    if (content.length < MIN_READABLE_TEXT) {
      console.warn(`[legal-collector] Insufficient readable text: ${item.url}`);
      return { document: null, discovered };
    }

    const sourceUrl = finalUrl.toString();
    const sourceDomain = finalUrl.hostname.toLowerCase().replace(/^www\./, "");
    const contentHash = createHash("sha256").update(content).digest("hex");

    return {
      document: {
        title,
        source_url: sourceUrl,
        source_domain: sourceDomain,
        document_type: getDocumentType(item.category, sourceUrl),
        content,
        content_hash: contentHash,
        source_updated_at: null,
        last_crawled_at: new Date().toISOString(),
        is_current: true,
      },
      discovered,
    };
  } catch (error) {
    console.error(
      `[legal-collector] Failed to fetch ${item.url}:`,
      error instanceof Error ? error.message : "Unknown error",
    );
    return { document: null, discovered: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncLegalLibrary() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = {
    checked: 0,
    stored: 0,
    unchanged: 0,
    skippedOrFailed: 0,
    discovered: 0,
    errors: [] as string[],
  };

  const queue: CollectionItem[] = [...MALAWI_LAW_LINKS];
  const queuedUrls = new Set(queue.map((item) => item.url));
  const visitedUrls = new Set<string>();
  let discoveredCount = 0;
  const BATCH_SIZE = 4;

  // Bounded batches keep a scheduled run from spending the timeout on one slow source.
  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const normalizedItemUrl = new URL(item.url);
        normalizedItemUrl.hash = "";
        const visitKey = normalizedItemUrl.toString();

        if (visitedUrls.has(visitKey)) {
          return { item, document: null, discovered: [], duplicate: true };
        }
        visitedUrls.add(visitKey);
        summary.checked += 1;

        const result = await collectPage(item);
        return { item, ...result, duplicate: false };
      }),
    );

    for (const result of batchResults) {
      if (result.duplicate) continue;
      const { item, document, discovered } = result;

      for (const candidate of discovered) {
        if (
          discoveredCount >= MAX_DISCOVERED_DOCUMENTS ||
          queuedUrls.has(candidate.url) ||
          visitedUrls.has(candidate.url)
        ) {
          continue;
        }

        queuedUrls.add(candidate.url);
        queue.push(candidate);
        discoveredCount += 1;
      }
      summary.discovered = discoveredCount;

      if (!document) {
        summary.skippedOrFailed += 1;
        continue;
      }

      try {
        const { data: existing, error: lookupError } = await supabase
          .from("legal_library_documents")
          .select("id, content_hash")
          .eq("source_url", document.source_url)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (existing?.content_hash === document.content_hash) {
          const { error: updateError } = await supabase
            .from("legal_library_documents")
            .update({ last_crawled_at: document.last_crawled_at })
            .eq("id", existing.id);

          if (updateError) throw updateError;
          summary.unchanged += 1;
          continue;
        }

        const { error: saveError } = await supabase
          .from("legal_library_documents")
          .upsert(document, { onConflict: "source_url" });

        if (saveError) throw saveError;
        summary.stored += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[legal-collector] Could not store ${item.url}:`, message);
        summary.skippedOrFailed += 1;
        summary.errors.push(`${item.title}: ${message}`);
      }
    }
  }

  console.info("[legal-collector] Sync completed:", summary);
  return summary;
}
