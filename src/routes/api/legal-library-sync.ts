import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { syncLegalLibrary } from "@/lib/legal-library-collector.server";

function constantTimeSecretMatch(
  expectedSecret: string | undefined,
  providedSecret: string | null,
): boolean {
  if (!expectedSecret || !providedSecret) {
    return false;
  }

  const expected = Buffer.from(expectedSecret, "utf8");
  const provided = Buffer.from(providedSecret, "utf8");

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function isPostAuthorized(request: Request): boolean {
  return constantTimeSecretMatch(
    process.env.LEGAL_LIBRARY_SYNC_SECRET,
    request.headers.get("x-legal-library-sync-secret"),
  );
}

function isCronAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  return constantTimeSecretMatch(process.env.CRON_SECRET, token);
}

async function runSync(): Promise<Response> {
  try {
    const summary = await syncLegalLibrary();

    return Response.json({
      success: true,
      message: "Legal library sync completed.",
      summary,
    });
  } catch (error) {
    console.error(
      "[legal-library-sync] Sync failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return Response.json(
      {
        success: false,
        error: "Legal library sync failed.",
      },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/legal-library-sync")({
  server: {
    handlers: {
      // Manual/internal POST requests use the dedicated sync secret.
      POST: async ({ request }) => {
        if (!isPostAuthorized(request)) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        return runSync();
      },

      // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
      GET: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        return runSync();
      },
    },
  },
});
