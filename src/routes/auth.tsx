import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/red-checker-logo.png";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/chat" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const onGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error(
          /unsupported provider|not enabled/i.test(result.error.message ?? "")
            ? "Google sign-in isn't available yet — use email and password."
            : (result.error.message ?? "Could not sign in with Google"),
        );
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/chat" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in with Google");
      setLoading(false);
    }
  };


  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/chat" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(
        /invalid login credentials/i.test(message)
          ? "Wrong email or password. If you just signed up, confirm your email first."
          : message,
      );
    } finally {
      setLoading(false);
    }
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
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to keep your legal conversations."
              : "Start asking questions about Malawi law."}
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={onGoogle}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.29h5.9c-.25 1.36-1.02 2.51-2.18 3.28v2.72h3.52c2.06-1.9 3.26-4.7 3.26-8.02z"/>
              <path fill="#34A853" d="M12 23c2.94 0 5.4-.98 7.2-2.66l-3.52-2.72c-.98.66-2.23 1.05-3.68 1.05-2.83 0-5.22-1.9-6.08-4.47H2.29v2.8A10.99 10.99 0 0 0 12 23z"/>
              <path fill="#FBBC05" d="M5.92 14.2A6.6 6.6 0 0 1 5.55 12c0-.77.13-1.51.37-2.2V7H2.29A11 11 0 0 0 1 12c0 1.77.42 3.44 1.29 5l3.63-2.8z"/>
              <path fill="#EA4335" d="M12 5.38c1.6 0 3.03.55 4.16 1.62l3.12-3.12C17.4 2.1 14.94 1 12 1 7.7 1 3.99 3.47 2.29 7l3.63 2.8C6.78 7.28 9.17 5.38 12 5.38z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onEmail} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
