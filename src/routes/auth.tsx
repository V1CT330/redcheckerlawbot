
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | RedBot Law Checker" },
      {
        name: "description",
        content: "Sign in to RedBot Law Checker with Google.",
      },
      { property: "og:title", content: "Sign in | RedBot Law Checker" },
      {
        property: "og:description",
        content: "Sign in to RedBot Law Checker with Google.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const redirected = useRef(false);

  const goToChat = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;

    void navigate({ to: "/chat", replace: true }).catch((error) => {
      redirected.current = false;
      console.error("Navigation to chat failed:", error);
      toast.error(
        "Signed in, but we couldn't open your chats. Please try again.",
      );
    });
  }, [navigate]);

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
        if (active) setCheckingSession(false);
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
    } catch (error) {
      console.error("Google sign-in failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setLoading(false);
    }
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
            Welcome to RedBot
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with Google to access your legal conversations.
          </p>

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

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Verify AI-generated legal information against official sources.
          </p>
        </div>
      </div>
    </div>
  );
      }
