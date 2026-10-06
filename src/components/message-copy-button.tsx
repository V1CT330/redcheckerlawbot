import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { toast } from "sonner";

export function MessageCopyButton({ text, from }: { text: string; from: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!text.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the message. Please try again.");
    }
  };

  return (
    <MessageActions className={from === "user" ? "justify-end" : undefined}>
      <MessageAction onClick={copy} tooltip={copied ? "Copied" : "Copy message"} label={copied ? "Copied" : "Copy message"} className="text-muted-foreground">
        {copied ? <Check /> : <Copy />}
      </MessageAction>
      <span className="sr-only" role="status">{copied ? "Message copied" : ""}</span>
    </MessageActions>
  );
}