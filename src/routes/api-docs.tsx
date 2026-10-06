import { createFileRoute, redirect } from "@tanstack/react-router";

// The docs live inside the app now; send old links there.
export const Route = createFileRoute("/api-docs")({
  beforeLoad: () => {
    throw redirect({ to: "/chat/api-docs", replace: true });
  },
});
