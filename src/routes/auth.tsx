import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useServerFn } from "@tanstack/react-start";
import { sendSignupCode, sendRecoveryCode } from "@/lib/auth-email.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | RedBot Law Checker" },
      { name: "description", content: "Sign in or create a RedBot Law Checker account with your email." },
      { property: "og:title", content: "Sign in | RedBot Law Checker" },
      { property: "og:description", content: "Sign in or create a RedBot Law Checker account with your email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "verify" | "forgot" | "reset">("signin");
  const [verifyType, setVerifyType] = useState<"signup" | "magiclink">("signup");
  const signupCodeFn = useServerFn(sendSignupCode);
  const recoveryCodeFn = useServerFn(sendRecoveryCode);
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

  // A validated, persisted session remains signed in until the user signs out.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) goToChat();
    });
    return () => { active = false; };
  }, [goToChat]);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const r = await signupCodeFn({ data: { email, password } });
        if (!r.ok) throw new Error(r.error);
        setVerifyType(r.type === "magiclink" ? "magiclink" : "signup");
        toast.success("RedBot Law Checker sent a verification code to your email.");
        setCode("");
        setMode("verify");
        return;
      } else if (mode === "forgot") {
        await recoveryCodeFn({ data: { email } });
        toast.success("If that account exists, RedBot Law Checker sent a reset code.");
        setCode(""); setPassword("");
        setMode("reset");
        return;
      } else if (mode === "reset") {
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
        if (error) throw error;
        const { error: e2 } = await supabase.auth.updateUser({ password });
        if (e2) throw e2;
        toast.success("Password updated.");
      } else if (mode === "verify") {
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: verifyType });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goToChat();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (/email not confirmed/i.test(message)) {
        const r = await signupCodeFn({ data: { email, password } });
        if (r.ok) setVerifyType(r.type === "magiclink" ? "magiclink" : "signup");
        toast.info("Your email isn't verified yet. RedBot Law Checker sent you a new code.");
        setMode("verify");
      } else {
        toast.error(
          /invalid login credentials/i.test(message)
            ? "Wrong email or password."
            : /expired|invalid/i.test(message) && (mode === "verify" || mode === "reset")
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
    try {
      if (mode === "reset") await recoveryCodeFn({ data: { email } });
      else {
        const r = await signupCodeFn({ data: { email, password } });
        if (!r.ok) throw new Error(r.error);
      }
      toast.success("New code sent from RedBot Law Checker.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-4">
          <BrandLogo className="w-14 sm:w-16" />
          <span className="min-w-0 font-serif text-2xl font-bold leading-tight sm:text-3xl">RedBot Law Checker</span>
        </Link>
        <div className="rounded-2xl border bg-card p-8 shadow-lg">
          <h1 className="font-serif text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Verify your email"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to keep your legal conversations."
              : mode === "signup"
                ? "Start asking questions about Malawi law."
                : mode === "forgot"
                  ? "Enter your email and we'll send you a reset code."
                  : `Enter the code RedBot Law Checker sent to ${email}.`}
          </p>

          <form onSubmit={onEmail} className="mt-6 space-y-4">
            {mode === "forgot" ? (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
            ) : mode === "verify" || mode === "reset" ? (
              <div className="space-y-4"><div>
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
              {mode === "reset" && (
                <div>
                  <Label htmlFor="newpw">New password</Label>
                  <Input id="newpw" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
              )}</div>
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
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset code" : mode === "reset" ? "Update password" : "Verify and continue"}
            </Button>
          </form>

          {mode === "signin" && (
            <p className="mt-4 text-center text-sm">
              <button type="button" className="text-primary hover:underline" onClick={() => setMode("forgot")}>
                Forgot your password?
              </button>
            </p>
          )}
          {mode === "forgot" ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            </p>
          ) : mode === "verify" || mode === "reset" ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Didn't get it?{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={resend} disabled={loading}>
                Resend code
              </button>{" · "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode(mode === "reset" ? "forgot" : "signup")}>
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
