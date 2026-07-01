import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { MALAWI_LAW_SYSTEM_PROMPT } from "@/lib/malawi-law-prompt";

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        try {
          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");
          const result = streamText({
            model,
            system: MALAWI_LAW_SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages as UIMessage[]),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (err) {
          console.error("[chat] streamText error", err);
          const status =
            err && typeof err === "object" && "status" in err
              ? Number((err as { status?: number }).status) || 500
              : 500;
          return new Response(
            status === 429
              ? "Rate limit exceeded. Please wait a moment and try again."
              : status === 402
                ? "AI credits exhausted. Please add credits to continue."
                : "Something went wrong generating the reply.",
            { status },
          );
        }
      },
    },
  },
});
