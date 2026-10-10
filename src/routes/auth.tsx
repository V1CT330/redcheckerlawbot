import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import { useServerFn } from "@tanstack/react-start";
import {
  sendSignupCode,
  sendRecoveryCode,
} from "@/lib/auth-email.functions";

type AuthMode = "signin" | "signup" | "verify" | "forgot" | "reset";
type VerifyType = "signup" | "magiclink";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | RedBot Law Checker" },
      {
        name: "description",
        content:
          "Sign in or create a RedBot Law Checker account with Google or email.",
      },
      { property: "og:title", content: "Sign in | RedBot Law Checker" },
      {
        property: "og:description",
        content:
          "Sign in or create a RedBot Law Checker account with Google or email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const signupCodeFn = useServerFn(sendSignupCode);
  const recoveryCodeFn = useServerFn(sendRecoveryCode);

  const [mode, setMode] = useState<AuthMode>("signin");
  const [verifyType, setVerifyType] = useState<VerifyType>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const redirected = useRef(false);

  const goToChat = useCallback(() => {
    if (redirected.current) return;

    redirected.current = true;

    void navigate({ to: "/chat", replace: true }).catch((error) => {
      redirected.current = false;
      console.error("Navigation to chat failed:", error);
      toast.error("Signed in, but we couldn't open your chats. Please try again.");
    });
  }, [navigate]);

  // Check for an existing session before displaying the sign-in form.
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!active) return;

        if (!error && data.user) {
          goToChat();
        }
      } catch (error) {
        console.error("Session check failed:", error);
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, [goToChat]);

  const onGoogleSignIn = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) throw error;

      // Supabase normally redirects the browser to Google.
      // If it does not, allow the user to try again.
      setLoading(false);
    } catch (error) {
      console.error("Google sign-in failed:", error);

      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setLoading(false);
    }
  };

  const onEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      if (mode === "signup") {
        const result = await signupCodeFn({
          data: { email: email.trim(), password },
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        setVerifyType(
          result.type === "magiclink" ? "magiclink" : "signup",
        );
        setCode("");
        setMode("verify");

        toast.success(
          "A verification code has been sent to your email.",
        );
        return;
      }

      if (mode === "forgot") {
        await recoveryCodeFn({ data: { email: email.trim() } });

        setCode("");
        setPassword("");
        setMode("reset");

        toast.success(
          "If that account exists, a password reset code has been sent.",
        );
        return;
      }

      if (mode === "reset") {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "recovery",
        });

        if (verifyError) throw verifyError;

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) throw updateError;

        toast.success("Your password has been updated.");
        setPassword("");
        setCode("");
        goToChat();
        return;
      }

      if (mode === "verify") {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: verifyType,
        });

        if (error) throw error;

        toast.success("Your email has been verified.");
        goToChat();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      goToChat();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed.";

      console.error("Email authentication failed:", error);

      if (/email not confirmed/i.test(message)) {
        try {
          const result = await signupCodeFn({
            data: { email: email.trim(), password },
          });

          if (!result.ok) {
            throw new Error(result.error);
          }

          setVerifyType(
            result.type === "magiclink" ? "magiclink" : "signup",
          );
          setCode("");
          setMode("verify");

          toast.info(
            "Your email isn't verified yet. A new verification code has been sent.",
          );
        } catch (sendError) {
          console.error("Verification email failed:", sendError);

          toast.error(
            sendError instanceof Error
              ? sendError.message
              : "We couldn't send a verification code. Please try again.",
          );
        }
      } else if (/invalid login credentials/i.test(message)) {
        toast.error("Wrong email or password.");
      } else if (
        /expired|invalid/i.test(message) &&
        (mode === "verify" || mode === "reset")
      ) {
        toast.error("That code is wrong or expired. Request a new one.");
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading) return;

    setLoading(true);

    try {
      if (mode === "reset") {
        await recoveryCodeFn({ data: { email: email.trim() } });
      } else {
        const result = await signupCodeFn({
          data: { email: email.trim(), password },
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        setVerifyType(
          result.type === "magiclink" ? "magiclink" : "signup",
        );
      }

      setCode("");
      toast.success("A new code has been sent.");
    } catch (error) {
      console.error("Resending authentication code failed:", error);

      toast.error(
        error instanceof Error ? error.message : "Could not send the code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setCode("");
    setMode(mode === "reset" ? "forgot" : "signup");
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">
          Checking your session...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-8 flex items-center justify-center gap-4"
        >
          <BrandLogo className="w-14 sm:w-16" />
          <span className="min-w-0 font-serif text-2xl font-bold leading-tight sm:text-3xl">
            RedBot Law Checker
          </span>
        </Link>

        <div className="rounded-2xl border bg-card p-8 shadow-lg">
          <h1 className="font-serif text-2xl font-semibold">
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
                ? "Create your account"
                : mode === "forgot"
                  ? "Reset your password"
                  : mode === "reset"
                    ? "Choose a new password"
                    : "Verify your email"}
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to keep your legal conversations."
              : mode === "signup"
                ? "Start asking questions about Malawi law."
                : mode === "forgot"
                  ? "Enter your email and we'll send you a reset code."
                  : mode === "reset"
                    ? "Enter your reset code and choose a new password."
                    : `Enter the code RedBot Law Checker sent to ${email}.`}
          </p>

          {(mode === "signin" || mode === "signup") && (
            <>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={onGoogleSignIn}
                disabled={loading}
              >
                <span
                  aria-hidden="true"
                  className="mr-2 text-base font-bold"
                >
                  G
                </span>
                {loading ? "Connecting..." : "Continue with Google"}
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  OR CONTINUE WITH EMAIL
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onEmail} className="space-y-4">
            {mode === "forgot" ? (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            ) : mode === "verify" || mode === "reset" ? (
              <div className="space-y-4">
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
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    className="text-center text-lg tracking-[0.5em]"
                  />
                </div>

                {mode === "reset" && (
                  <div>
                    <Label htmlFor="newpw">New password</Label>
                    <Input
                      id="newpw"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
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
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {mode === "signin"
                ? "Sign in with email"
                : mode === "signup"
                  ? "Create account with email"
                  : mode === "forgot"
                    ? "Send reset code"
                    : mode === "reset"
                      ? "Update password"
                      : "Verify and continue"}
            </Button>
          </form>

          {mode === "signin" && (
            <p className="mt-4 text-center text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setMode("forgot")}
              >
                Forgot your password?
              </button>
            </p>
          )}

          {mode === "forgot" ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            </p>
          ) : mode === "verify" || mode === "reset" ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Didn't get it?{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={resend}
                disabled={loading}
              >
                Resend code
              </button>
              {" · "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={changeEmail}
                disabled={loading}
              >
                Change email
              </button>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() =>
                  setMode(mode === "signin" ? "signup" : "signin")
                }
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
            }
