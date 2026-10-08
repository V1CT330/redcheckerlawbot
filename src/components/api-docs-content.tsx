import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, BookOpen, Terminal, Play, Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="ml-1 text-xs">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <pre className="overflow-x-auto bg-muted/30 p-4 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type PlaygroundResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; status: number; ms: number; body: string };

function Playground({ baseUrl }: { baseUrl: string }) {
  const [apiKey, setApiKey] = useState("");
  const [question, setQuestion] = useState(
    "What is the notice period for terminating an employee in Malawi?"
  );
  const [result, setResult] = useState<PlaygroundResult>({ kind: "idle" });

  const send = async () => {
    setResult({ kind: "loading" });
    const started = performance.now();
    try {
      const res = await fetch(`${baseUrl}/api/public/v1/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw text */
      }
      setResult({ kind: "done", status: res.status, ms, body: pretty });
    } catch (err) {
      setResult({
        kind: "done",
        status: 0,
        ms: Math.round(performance.now() - started),
        body: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  const loading = result.kind === "loading";
  const statusColor =
    result.kind === "done"
      ? result.status >= 200 && result.status < 300
        ? "text-green-600 dark:text-green-400"
        : "text-destructive"
      : "";

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="pg-key">
          API key
        </label>
        <Input
          id="pg-key"
          type="password"
          placeholder="rlb_sk_…"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Your key is only sent to this app's own API. It is never stored or sent elsewhere.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="pg-question">
          Question
        </label>
        <Textarea
          id="pg-question"
          rows={3}
          maxLength={4000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground">{question.length}/4000</p>
      </div>

      <Button onClick={send} disabled={loading || !apiKey.trim() || !question.trim()}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Play className="mr-2 h-4 w-4" />
        )}
        {loading ? "Asking…" : "Send request"}
      </Button>

      {result.kind === "done" && (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 border-b bg-muted/60 px-3 py-1.5 text-xs">
            <span className={`font-semibold ${statusColor}`}>
              {result.status === 0 ? "Network error" : `HTTP ${result.status}`}
            </span>
            <span className="text-muted-foreground">{result.ms} ms</span>
          </div>
          <pre className="max-h-96 overflow-auto bg-muted/30 p-4 text-xs leading-relaxed whitespace-pre-wrap">
            <code>{result.body}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export function ApiDocsContent() {
  // Resolve the origin after mount so SSR and the first client render match
  // (avoids a hydration mismatch on the code samples).
  const [baseUrl, setBaseUrl] = useState("https://your-redbot-url");
  useEffect(() => setBaseUrl(window.location.origin), []);

  const curl = `curl -X POST ${baseUrl}/api/public/v1/ask \\
  -H "Authorization: Bearer rlb_sk_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What is the notice period for terminating an employee in Malawi?"}'`;

  const js = `const res = await fetch("${baseUrl}/api/public/v1/ask", {
  method: "POST",
  headers: {
    "Authorization": "Bearer rlb_sk_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    question: "What is the notice period for terminating an employee in Malawi?",
  }),
});

const data = await res.json();
console.log(data.answer);`;

  const python = `import requests

res = requests.post(
    "${baseUrl}/api/public/v1/ask",
    headers={"Authorization": "Bearer rlb_sk_YOUR_KEY"},
    json={"question": "What is the notice period for terminating an employee in Malawi?"},
)

print(res.json()["answer"])`;

  const responseExample = `{
  "answer": "Under the Employment Act 2000 (Malawi), the notice period depends on how often wages are paid…",
  "sources_note": "Answers cite Malawian statutes, cases and official portals where applicable."
}`;

  const errorExample = `{
  "error": "Invalid or revoked API key."
}`;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
        {/* Intro */}
        <section>
          <h1 className="mb-2 text-3xl font-bold">RedBot Developer API</h1>
          <p className="max-w-2xl text-muted-foreground">
            Ask questions about the Constitution, statutes and case law of the Republic of Malawi
            from your own application with a single HTTP request. Answers are grounded in Malawian
            legal sources, with live search across MalawiLII and official government portals.
          </p>
        </section>

        {/* Authentication */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="h-5 w-5 text-primary" /> Authentication
          </h2>
          <p className="text-sm text-muted-foreground">
            Every request needs an API key. Sign in to RedBot Law Checker, open the{" "}
            <strong>API</strong> tab in the sidebar, and create a key. Keys start with{" "}
            <code className="rounded bg-muted px-1">rlb_sk_</code> and are shown only once. Store
            yours somewhere safe.
          </p>
          <p className="text-sm text-muted-foreground">
            Send the key in the <code className="rounded bg-muted px-1">Authorization</code> header
            as a Bearer token (preferred), or in the{" "}
            <code className="rounded bg-muted px-1">x-api-key</code> header:
          </p>
          <CodeBlock
            title="Auth headers"
            code={`Authorization: Bearer rlb_sk_YOUR_KEY
# or
x-api-key: rlb_sk_YOUR_KEY`}
          />
          <div className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Keep keys secret. Never embed them in browser code or public repositories. If a key
              leaks, revoke it immediately from the API tab. One key per application is
              recommended.
            </p>
          </div>
        </section>

        {/* Endpoint */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Terminal className="h-5 w-5 text-primary" /> Ask a legal question
          </h2>
          <p className="text-sm">
            <code className="rounded bg-muted px-1.5 py-0.5 font-semibold">
              POST {baseUrl}/api/public/v1/ask
            </code>
          </p>

          <h3 className="pt-2 text-sm font-semibold">Request body (JSON)</h3>
          <div className="overflow-hidden rounded-lg border text-sm">
            <table className="w-full">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2">
                    <code>question</code>
                  </td>
                  <td className="px-3 py-2">string</td>
                  <td className="px-3 py-2">
                    Required. Your Malawi law question, up to 4000 characters.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="pt-2 text-sm font-semibold">Success response: 200</h3>
          <CodeBlock title="Response" code={responseExample} />

          <h3 className="pt-2 text-sm font-semibold">Error responses</h3>
          <CodeBlock title="Error shape" code={errorExample} />
          <div className="overflow-hidden rounded-lg border text-sm">
            <table className="w-full">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2"><code>400</code></td>
                  <td className="px-3 py-2">Missing/invalid body, or question over 4000 characters.</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2"><code>401</code></td>
                  <td className="px-3 py-2">Missing, invalid or revoked API key.</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2"><code>429</code></td>
                  <td className="px-3 py-2">Rate limit exceeded. Retry with backoff.</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2"><code>500</code></td>
                  <td className="px-3 py-2">Server error generating the answer.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Playground */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FlaskConical className="h-5 w-5 text-primary" /> Try it live
          </h2>
          <p className="text-sm text-muted-foreground">
            Paste your API key and a question to send a real request to the endpoint and inspect
            the response, including the status code, timing and full body.
          </p>
          <Playground baseUrl={baseUrl} />
        </section>

        {/* Code samples */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <BookOpen className="h-5 w-5 text-primary" /> Code samples
          </h2>
          <CodeBlock title="cURL" code={curl} />
          <CodeBlock title="JavaScript / TypeScript" code={js} />
          <CodeBlock title="Python" code={python} />
        </section>

        {/* Notes */}
        <section className="space-y-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">Good to know</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Answers cite Malawian statutes, cases and official portals where applicable.</li>
            <li>
              The assistant protects privacy: it will not identify minors, protected complainants or
              parties in anonymized matters.
            </li>
            <li>Responses are informational, not legal advice.</li>
            <li>Fair-use rate limits apply; use backoff on 429 responses.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
