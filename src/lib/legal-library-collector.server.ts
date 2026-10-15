import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  MALAWI_LAW_DOMAINS,
  MALAWI_LAW_LINKS,
} from "@/lib/malawi-law-links";

const MAX_CONTENT_LENGTH = 100_000;
const REQUEST_TIMEOUT_MS = 20_000;

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

function isApprovedSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    return MALAWI_LAW_DOMAINS.some((domain) => {
      const approvedDomain = domain
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];

      return (
        hostname === approvedDomain ||
        hostname.endsWith(`.${approvedDomain}`)
      );
    });
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
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(parseInt(value, 16)),
    );
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
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

  if (!match) {
    return fallback;
  }

  const title = htmlToText(match[1]).slice(0, 300);

  return title || fallback;
}

function getDocumentType(
  category: string,
  url: string,
): DocumentType {
  if (category === "constitution") {
    return "constitution";
  }

  if (category === "cases") {
    return "judgment";
  }

  if (category === "policy" || category === "help") {
    return "policy";
  }

  if (/regulations?/i.test(url)) {
    return "regulation";
  }

  if (category === "acts") {
    return "act";
  }

  return "other";
}

async function collectPage(
  item: (typeof MALAWI_LAW_LINKS)[number],
): Promise<CollectedDocument | null> {
  if (!isApprovedSource(item.url)) {
    console.warn(`[legal-collector] Skipping unapproved URL: ${item.url}`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(item.url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RedBotLegalLibrary/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(
        `[legal-collector] HTTP ${response.status}: ${item.url}`,
      );
      return null;
    }

    // Never store a page if the server redirected outside approved sources.
    if (!isApprovedSource(response.url)) {
      console.warn(
        `[legal-collector] Rejected redirected URL: ${response.url}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("text/html")) {
      console.warn(
        `[legal-collector] Skipping non-HTML response: ${item.url}`,
      );
      return null;
    }

    const html = await response.text();
    const content = htmlToText(html);

    // Avoid storing error pages, empty pages, or navigation-only results.
    if (content.length < 300) {
      console.warn(
        `[legal-collector] Insufficient readable text: ${item.url}`,
      );
      return null;
    }

    const title = extractTitle(html, item.title);
    const sourceUrl = response.url;
    const sourceDomain = new URL(sourceUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const contentHash = createHash("sha256")
      .update(content)
      .digest("hex");

    return {
      title,
      source_url: sourceUrl,
      source_domain: sourceDomain,
      document_type: getDocumentType(item.category, item.url),
      content,
      content_hash: contentHash,
      source_updated_at: null,
      last_crawled_at: new Date().toISOString(),
      is_current: true,
    };
  } catch (error) {
    console.error(
      `[legal-collector] Failed to fetch ${item.url}:`,
      error instanceof Error ? error.message : "Unknown error",
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncLegalLibrary() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const summary = {
    checked: 0,
    stored: 0,
    unchanged: 0,
    skippedOrFailed: 0,
    errors: [] as string[],
  };

  // The initial version only fetches our curated list.
  // It does not recursively crawl websites.
  for (const item of MALAWI_LAW_LINKS) {
    summary.checked += 1;

    try {
      const document = await collectPage(item);

      if (!document) {
        summary.skippedOrFailed += 1;
        continue;
      }

      const { data: existing, error: lookupError } = await supabase
        .from("legal_library_documents")
        .select("id, content_hash")
        .eq("source_url", document.source_url)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      if (existing?.content_hash === document.content_hash) {
        // Content has not changed; only refresh the last-checked time.
        const { error: updateError } = await supabase
          .from("legal_library_documents")
          .update({
            last_crawled_at: document.last_crawled_at,
          })
          .eq("id", existing.id);

        if (updateError) {
          throw updateError;
        }

        summary.unchanged += 1;
        continue;
      }

      const { error: saveError } = await supabase
        .from("legal_library_documents")
        .upsert(document, {
          onConflict: "source_url",
        });

      if (saveError) {
        throw saveError;
      }

      summary.stored += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      console.error(
        `[legal-collector] Could not store ${item.url}:`,
        message,
      );

      summary.skippedOrFailed += 1;
      summary.errors.push(`${item.title}: ${message}`);
    }
  }

  console.info("[legal-collector] Sync completed:", summary);

  return summary;
        }
