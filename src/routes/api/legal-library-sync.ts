import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { syncLegalLibrary } from "@/lib/legal-library-collector.server";

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.LEGAL_LIBRARY_SYNC_SECRET;
  const providedSecret = request.headers.get(
    "x-legal-library-sync-secret",
  );

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

export const Route = createFileRoute("/api/legal-library-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return Response.json(
            { error: "Unauthorized." },
            { status: 401 },
          );
        }

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
      },
    },
  },
});
