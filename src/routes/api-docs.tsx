import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, BookOpen, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/red-checker-logo.png";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "Developer API — RedBot Law Checker" },
      {
        name: "description",
        content:
          "Public API documentation for RedBot Law Checker: authenticate with an API key and ask Malawi law questions with one HTTP request.",
      },
      { property: "og:title", content: "Developer API — RedBot Law Checker" },
      {
        property: "og:description",
        content:
          "Ask Malawi law questions programmatically. Authentication, parameters, response examples and copy-paste code samples.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiDocsPage,
});

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

function ApiDocsPage() {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-redbot-url";

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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <img src={logo} alt="RedBot Law Checker" className="h-12 w-12" />
          <div>
            <p className="text-lg font-bold leading-tight">RedBot Law Checker</p>
            <p className="text-xs text-muted-foreground">Developer API Documentation</p>
          </div>
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to app</Link>
            </Button>
          </div>
        </div>
      </header>

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
            <code className="rounded bg-muted px-1">rlb_sk_</code> and are shown only once — store
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
              Keep keys secret — never embed them in browser code or public repositories. If a key
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

          <h3 className="pt-2 text-sm font-semibold">Success response — 200</h3>
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
                  <td className="px-3 py-2">Rate limit exceeded — retry with backoff.</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2"><code>500</code></td>
                  <td className="px-3 py-2">Server error generating the answer.</td>
                </tr>
              </tbody>
            </table>
          </div>
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
