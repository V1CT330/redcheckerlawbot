import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Scale, ShieldCheck } from "lucide-react";
import logo from "@/assets/red-checker-logo.png";
import hero from "@/assets/malawi-hero.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Red Checker" width={36} height={36} className="h-9 w-9" />
          <span className="font-serif text-xl font-bold">Red Checker</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Sign in
          </Link>
          <Button asChild>
            <Link to="/chat">
              Open the Chat <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Malawi Law & Constitution AI
            </span>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-tight md:text-6xl">
              Know your rights <span className="text-primary">in plain language.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Red Checker is an AI assistant loaded with the Constitution, Acts of Parliament
              and public policies of the Republic of Malawi. Ask a question, get a clear
              answer with the section it comes from.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/chat">
                  Start chatting <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Create an account</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free while in preview. Not a substitute for a licensed Malawian legal
              practitioner.
            </p>
          </div>
          <div className="relative">
            <img
              src={hero}
              alt="Malawi flag flying at sunset in front of a government building"
              width={1600}
              height={900}
              className="aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-border"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: BookOpen,
              title: "The Constitution, cited",
              body: "Answers grounded in the 1994 Constitution — with the exact chapter and section.",
            },
            {
              icon: Scale,
              title: "Acts of Parliament",
              body: "Penal Code, Employment Act, Land Act, Marriage Act, Companies Act and more.",
            },
            {
              icon: ShieldCheck,
              title: "Speaks your language",
              body: "Reply in English, Chichewa or Tumbuka — whichever way you ask.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Red Checker · Malawi</p>
          <p>Educational tool — always consult a lawyer for binding advice.</p>
        </div>
      </footer>
    </div>
  );
}
