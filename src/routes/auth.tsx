import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/red-checker-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RedBot Law Checker" },
      { name: "description", content: "Sign in or create a RedBot Law Checker account with your email." },
      { property: "og:title", content: "Sign in — RedBot Law Checker" },
      { property: "og:description", content: "Sign in or create a RedBot Law Checker account with your email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "verify">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const redirected = useRef(false);
  const goToChat = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    navigate({ to: "/chat", replace: true }).catch(() => {
      redirected.current = false;
    });
  }, [navigate]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goToChat();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setTimeout(goToChat, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [goToChat]);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          toast.success("RedBot Law Checker sent a verification code to your email.");
          setCode("");
          setMode("verify");
          return;
        }
      } else if (mode === "verify") {
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goToChat();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (/email not confirmed/i.test(message)) {
        await supabase.auth.resend({ type: "signup", email });
        toast.info("Your email isn't verified yet. RedBot Law Checker sent you a new code.");
        setMode("verify");
      } else {
        toast.error(
          /invalid login credentials/i.test(message)
            ? "Wrong email or password."
            : /expired|invalid/i.test(message) && mode === "verify"
              ? "That code is wrong or expired. Request a new one."
              : message,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("New code sent from RedBot Law Checker.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-4">
          <img src={logo} alt="" width={80} height={80} className="h-20 w-20" />
          <span className="font-serif text-3xl font-bold md:text-4xl">RedBot Law Checker</span>
        </Link>
        <div className="rounded-2xl border bg-card p-8 shadow-lg">
          <h1 className="font-serif text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Verify your email"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to keep your legal conversations."
              : mode === "signup"
                ? "Start asking questions about Malawi law."
                : `Enter the code RedBot Law Checker sent to ${email}.`}
          </p>

          <form onSubmit={onEmail} className="mt-6 space-y-4">
            {mode === "verify" ? (
              <div>
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-[0.5em]"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"} />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Verify & continue"}
            </Button>
          </form>

          {mode === "verify" ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Didn't get it?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={resend} disabled={loading}>
                Resend code
              </button>{" · "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signup")}>
                Change email
              </button>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button type="button" className="font-medium text-primary hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
