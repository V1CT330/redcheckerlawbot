import { createClient } from "@supabase/supabase-js";
import { MALAWI_LAW_DOMAINS } from "@/lib/malawi-law-links";

type LegalLibraryResult = {
  id: string;
  title: string;
  source_url: string;
  source_domain: string;
  document_type: string;
  content: string;
  source_updated_at: string | null;
  last_crawled_at: string;
  rank: number;
};

function isApprovedSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
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

export async function searchLegalLibrary(
  query: string,
  limit = 5,
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    console.error(
      "[legal-library] Supabase configuration is missing.",
    );

    return {
      results: [] as LegalLibraryResult[],
      error: "The stored legal library is not configured.",
    };
  }

  try {
    const supabase = createClient(
      supabaseUrl,
      publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await supabase.rpc(
      "search_legal_library",
      {
        query_text: query.trim().slice(0, 500),
        result_limit: Math.max(1, Math.min(limit, 10)),
      },
    );

    if (error) {
      console.error(
        "[legal-library] Search failed:",
        error.message,
      );

      return {
        results: [] as LegalLibraryResult[],
        error: "The stored legal library search failed.",
      };
    }

    const results = ((data ?? []) as LegalLibraryResult[])
      .filter(
        (item) =>
          isApprovedSource(item.source_url) &&
          item.content?.trim().length > 0,
      )
      .map((item) => ({
        ...item,
        content: item.content.slice(0, 8000),
      }));

    return {
      results,
      note:
        results.length > 0
          ? "Results came from RedBot's stored legal library. Check source dates and the actual text before making legal claims."
          : "No matching stored legal documents were found.",
    };
  } catch (error) {
    console.error(
      "[legal-library] Unexpected search error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return {
      results: [] as LegalLibraryResult[],
      error: "The stored legal library could not be searched.",
    };
  }
