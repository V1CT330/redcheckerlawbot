
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  Info,
  LockKeyhole,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/settings")({
  component: SettingsPage,
});

type Theme = "light" | "dark";

const ACCENTS = [
  { name: "Blue", value: "221.2 83.2% 53.3%" },
  { name: "Violet", value: "262 83% 58%" },
  { name: "Green", value: "142 71% 45%" },
  { name: "Rose", value: "346 77% 50%" },
];

const THEME_KEY = "redbot-theme";
const ACCENT_KEY = "redbot-accent";

function SettingsPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState(ACCENTS[0].value);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
            data.user.app_metadata?.provider ??
            data.user.app_metadata?.providers?.[0] ??
            "email";

          setProvider(
            String(authProvider).charAt(0).toUpperCase() +
              String(authProvider).slice(1),
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

  // Load saved appearance preferences after the page mounts.
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      const savedAccent = localStorage.getItem(ACCENT_KEY);

      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      } else {
        setTheme(
          document.documentElement.classList.contains("dark")
            ? "dark"
            : "light",
        );
      }

      if (
        savedAccent &&
        ACCENTS.some((item) => item.value === savedAccent)
      ) {
        setAccent(savedAccent);
      }
    } catch (error) {
      console.error("Could not load appearance preferences:", error);
    } finally {
      setPreferencesLoaded(true);
    }
  }, []);

  // Apply and save appearance preferences.
  useEffect(() => {
    if (!preferencesLoaded) return;

    const root = document.documentElement;

    root.classList.toggle("dark", theme === "dark");
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--sidebar-primary", accent);
    root.style.setProperty("--sidebar-ring", accent);

    try {
      localStorage.setItem(THEME_KEY, theme);
      localStorage.setItem(ACCENT_KEY, accent);
    } catch (error) {
      console.error("Could not save appearance preferences:", error);
    }
  }, [theme, accent, preferencesLoaded]);

  const deleteAccount = async () => {
    setDeleteError("");

    const confirmed = window.confirm(
      "Permanently delete your RedBot account? This action cannot be undone. Your account and associated data will be deleted according to the configured deletion policy.",
    );

    if (!confirmed) return;

    const confirmation = window.prompt(
      'To confirm permanent deletion, type DELETE below.',
    );

    if (confirmation !== "DELETE") {
      setDeleteError("Account deletion cancelled. Confirmation did not match.");
      return;
    }

    setDeleting(true);

    try {
      // Requires a deployed Supabase Edge Function named "delete-account".
      // The function must authenticate the caller and securely delete their
      // account and associated data on the server.
      const { error } = await supabase.functions.invoke("delete-account");

      if (error) throw error;

      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        console.error(
          "Account deletion succeeded, but local sign-out failed:",
          signOutError,
        );
      }

      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      console.error("Account deletion failed:", error);

      setDeleteError(
        error instanceof Error
          ? `Account deletion failed: ${error.message}`
          : "Account deletion failed. Please try again or contact support.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-12 sm:p-8">
      <header className="mb-8">
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          RedBot Law Checker
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your appearance, account, privacy and security.
        </p>
      </header>

      {/* Appearance */}
      <section
        id="appearance"
        className="scroll-mt-6 rounded-xl border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <Palette className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize how RedBot looks on this device.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium">Color theme</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
              className={`flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted ${
                theme === "light"
                  ? "border-primary ring-1 ring-primary"
                  : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <Sun className="h-5 w-5" />
                <span className="font-medium">Light</span>
              </span>
              {theme === "light" && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
              className={`flex items-center justify-between rounded-lg border p-4 text-left transition hover:bg-muted ${
                theme === "dark"
                  ? "border-primary ring-1 ring-primary"
                  : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <Moon className="h-5 w-5" />
                <span className="font-medium">Dark</span>
              </span>
              {theme === "dark" && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Your theme preference is saved on this device.
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium">Accent color</p>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((item) => (
              <button
                key={item.name}
                type="button"
                title={item.name}
                aria-label={`${item.name} accent color`}
                aria-pressed={accent === item.value}
                onClick={() => setAccent(item.value)}
                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                  accent === item.value
                    ? "border-primary ring-1 ring-primary"
                    : "hover:bg-muted"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: `hsl(${item.value})` }}
                />
                {item.name}
                {accent === item.value && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Account information */}
      <section
        id="account"
        className="scroll-mt-6 rounded-xl border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <UserRound className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Account Settings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Information associated with your signed-in account.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Loading account information...
          </p>
        ) : loadError ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {loadError}
          </p>
        ) : (
          <div className="mt-5 divide-y">
            <div className="py-3">
              <p className="text-sm text-muted-foreground">Email address</p>
              <p className="mt-1 break-all font-medium">{email}</p>
            </div>

            <div className="py-3">
              <p className="text-sm text-muted-foreground">Sign-in method</p>
              <p className="mt-1 font-medium">{provider}</p>
            </div>

            <div className="py-3">
              <p className="text-sm text-muted-foreground">Account created</p>
              <p className="mt-1 font-medium">{createdAt}</p>
            </div>
          </div>
        )}

        <p className="mt-3 text-sm text-muted-foreground">
          Passwords and Google sign-in security are managed by your
          authentication provider.
        </p>
      </section>

      {/* Privacy and security */}
      <section
        id="privacy"
        className="scroll-mt-6 rounded-xl border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Privacy &amp; Security</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Protect your account and the information you work with.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Protect your sign-in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Never share your password or verification codes. If you use
                Google sign-in, review security settings in your Google
                account.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Shared devices</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign out when using a shared device. Avoid leaving sensitive
                legal documents open where other people can access them.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Your legal documents</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Only upload documents you are authorized to use. Review
                RedBot&apos;s applicable privacy policy before uploading
                confidential or sensitive material.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Help and support */}
      <section
        id="help"
        className="scroll-mt-6 rounded-xl border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Help &amp; Support</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try these steps if something is not working.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-medium">Account or sign-in problems</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh the page and check your internet connection. If
              necessary, sign out and sign in again.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Chats or documents not loading</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh the page and retry. If the problem continues, record the
              error message so it can be investigated.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Legal answers</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check cited legislation and case law against authoritative
              sources. AI-generated responses can contain mistakes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Refresh RedBot
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        className="scroll-mt-6 rounded-xl border bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">About RedBot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              RedBot Law Checker helps users explore legal information and
              work with legal documents, with a focus on Malawi law.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Legal disclaimer</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            RedBot provides legal information, not a substitute for advice
            from a qualified legal professional. AI responses may be
            inaccurate or incomplete. Verify relevant laws, amendments,
            judgments and citations using authoritative sources before
            relying on an answer for legal decisions.
          </p>
        </div>
      </section>

      {/* Delete account */}
      <section
        id="delete-account"
        className="scroll-mt-6 rounded-xl border border-destructive/40 bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <h2 className="text-lg font-semibold text-destructive">
              Delete Account
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently remove your RedBot account.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-destructive/5 p-4">
          <p className="text-sm leading-6">
            Account deletion is permanent and may remove account-related
            information and content according to RedBot&apos;s deletion
            policy. Make sure you understand what will be deleted before
            continuing.
          </p>
        </div>

        {deleteError && (
          <p role="alert" className="mt-4 break-words text-sm text-destructive">
            {deleteError}
          </p>
        )}

        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "Deleting account..." : "Permanently delete account"}
        </button>
      </section>
    </main>
  );
      }
                                             
