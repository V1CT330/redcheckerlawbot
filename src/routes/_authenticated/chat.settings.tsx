
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        if (!data.user) {
          if (mounted) {
            setLoadError("No signed-in account was found.");
          }
          return;
        }

        if (mounted) {
          setEmail(data.user.email ?? "No email available");

          const authProvider =
            data.user.app_metadata?.provider ?? "email";

          setProvider(
            authProvider.charAt(0).toUpperCase() +
              authProvider.slice(1),
          );

          setCreatedAt(
            data.user.created_at
              ? new Date(data.user.created_at).toLocaleDateString()
              : "Unavailable",
          );
        }
      } catch (error) {
        console.error("Could not load account settings:", error);

        if (mounted) {
          setLoadError(
            "Account information could not be loaded. Please refresh and try again.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadAccount();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your RedBot Law Checker account and security information.
        </p>
      </div>

      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">
          Account information
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Details associated with your signed-in account.
        </p>

        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Loading account information...
          </p>
        ) : loadError ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {loadError}
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Email address
              </p>
              <p className="mt-1 break-all font-medium">
                {email}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Sign-in method
              </p>
              <p className="mt-1 font-medium">{provider}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Account created
              </p>
              <p className="mt-1 font-medium">{createdAt}</p>
            </div>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account sign-in is managed through Supabase Authentication.
        </p>
        <p className="mt-3 text-sm">
          If you use Google to sign in, manage your password and security
          settings through your Google account.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">About RedBot</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          RedBot Law Checker helps users explore legal information and work
          with legal documents.
        </p>
      </section>
    </main>
  );
          }
