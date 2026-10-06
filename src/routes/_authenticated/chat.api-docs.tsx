import { createFileRoute } from "@tanstack/react-router";
import { ApiDocsContent } from "@/components/api-docs-content";

export const Route = createFileRoute("/_authenticated/chat/api-docs")({
  head: () => ({
    meta: [
      { title: "API Documentation | RedBot Law Checker" },
      { name: "description", content: "Developer API documentation for RedBot Law Checker." },
      { property: "og:title", content: "API Documentation | RedBot Law Checker" },
      { property: "og:description", content: "Developer API documentation for RedBot Law Checker." },
    ],
  }),
  component: ApiDocsContent,
});
