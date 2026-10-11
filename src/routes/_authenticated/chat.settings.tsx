
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
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/settings")({
  component: SettingsPage,
});

type Theme = "light" | "dark";

const DEFAULT_ACCENT = "#3B82F6";
const THEME_KEY = "redbot-theme";
const ACCENT_KEY = "redbot-accent";

function isValidHex(value: string) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function normalizeHex(value: string) {
  if (!isValidHex(value)) return DEFAULT_ACCENT;

  if (value.length === 4) {
    return (
      "#" +
      value
        .slice(1)
        .split("")
        .map((character) => character + character)
        .join("")
    ).toUpperCase();
  }

  return value.toUpperCase();
}

// Convert HEX into the HSL channels expected by the app's CSS variables.
function hexToHsl(hex: string) {
  const normalized = normalizeHex(hex);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (delta !== 0) {
    saturation =
      delta / (1 - Math.abs(2 * lightness - 1));

    switch (max) {
      case red:
        hue = 60 * (((green - blue) / delta) % 6);
        break;
      case green:
        hue = 60 * ((blue - red) / delta + 2);
        break;
      default:
        hue = 60 * ((red - green) / delta + 4);
        break;
    }
  }

  if (hue < 0) hue += 360;

  return `${hue.toFixed(2)} ${(saturation * 100).toFixed(2)}% ${(lightness * 100).toFixed(2)}%`;
}

function SettingsPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [hexInput, setHexInput] = useState(DEFAULT_ACCENT);
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

  // Restore saved appearance settings.
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

      if (savedAccent && isValidHex(savedAccent)) {
        const normalized = normalizeHex(savedAccent);
        setAccent(normalized);
        setHexInput(normalized);
      }
    } catch (error) {
      console.error("Could not load appearance preferences:", error);
    } finally {
      setPreferencesLoaded(true);
    }
  }, []);

  // Apply the theme and accent to the existing app design tokens.
  useEffect(() => {
    if (!preferencesLoaded) return;

    const root = document.documentElement;
    const hsl = hexToHsl(accent);

    root.classList.toggle("dark", theme === "dark");

    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
    root.style.setProperty("--sidebar-primary", hsl);
    root.style.setProperty("--sidebar-ring", hsl);

    try {
      localStorage.setItem(THEME_KEY, theme);
      localStorage.setItem(ACCENT_KEY, accent);
    } catch (error) {
      console.error("Could not save appearance preferences:", error);
    }
  }, [theme, accent, preferencesLoaded]);

  const updateAccent = (value: string) => {
    if (!isValidHex(value)) return;

    const normalized = normalizeHex(value);
    setAccent(normalized);
    setHexInput(normalized);
  };

  const resetAppearance = () => {
    setTheme("light");
    setAccent(DEFAULT_ACCENT);
    setHexInput(DEFAULT_ACCENT);
  };

  const deleteAccount = async () => {
    setDeleteError("");

    const confirmed = window.confirm(
      "Permanently delete your RedBot account? This action cannot be undone.",
    );

    if (!confirmed) return;

    const confirmation = window.prompt(
      'To confirm permanent deletion, type DELETE.',
    );

    if (confirmation !== "DELETE") {
      setDeleteError("Account deletion cancelled. Confirmation did not match.");
      return;
    }

    setDeleting(true);

    try {
      // Requires a deployed and tested Supabase Edge Function.
      const { error } = await supabase.functions.invoke("delete-account");

      if (error) throw error;

      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        console.error("Local sign-out failed after deletion:", signOutError);
      }

      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      console.error("Account deletion failed:", error);

      setDeleteError(
        error instanceof Error
          ? `Account deletion failed: ${error.message}`
          : "Account deletion failed. Please try again.",
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
      <section id="appearance" className="scroll-mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Palette className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize RedBot's appearance on this device.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium">Theme</p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
              className={`flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted ${
                theme === "light" ? "border-primary ring-1 ring-primary" : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <Sun className="h-5 w-5" />
                Light
              </span>
              {theme === "light" && <Check className="h-4 w-4 text-primary" />}
            </button>

            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
              className={`flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted ${
                theme === "dark" ? "border-primary ring-1 ring-primary" : ""
              }`}
            >
              <span className="flex items-center gap-3">
                <Moon className="h-5 w-5" />
                Dark
              </span>
              {theme === "dark" && <Check className="h-4 w-4 text-primary" />}
            </button>
          </div>
        </div>

        <div className="mt-7">
          <p className="text-sm font-medium">Accent color</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a color for buttons, selected tabs and interface highlights.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label
              htmlFor="redbot-color-spectrum"
              className="flex h-16 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border shadow-sm"
              title="Open the color spectrum"
              style={{ backgroundColor: accent }}
            >
              <input
                id="redbot-color-spectrum"
                type="color"
                value={accent}
                onChange={(event) => updateAccent(event.target.value)}
                aria-label="Choose accent color from the color spectrum"
                className="h-20 w-24 cursor-pointer scale-125 border-0 bg-transparent p-0"
              />
            </label>

            <div className="min-w-0 flex-1">
              <label
                htmlFor="redbot-hex-color"
                className="mb-2 block text-sm font-medium"
              >
                HEX color
              </label>
              <input
                id="redbot-hex-color"
                type="text"
                value={hexInput}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  const value = event.target.value.toUpperCase();
                  setHexInput(value);

                  if (isValidHex(value)) {
                    setAccent(normalizeHex(value));
                  }
                }}
                onBlur={() => {
                  if (isValidHex(hexInput)) {
                    const normalized = normalizeHex(hexInput);
                    setHexInput(normalized);
                    setAccent(normalized);
                  } else {
                    setHexInput(accent);
                  }
                }}
                placeholder="#3B82F6"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="mt-5 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Live preview</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {accent}
                </p>
              </div>
              <span
                className="h-10 w-10 rounded-full border"
                style={{ backgroundColor: accent }}
                aria-label={`Selected color ${accent}`}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm"
                style={{ backgroundColor: accent }}
              >
                Preview button
              </button>

              <span
                className="rounded-md border px-3 py-2 text-sm font-medium"
                style={{ color: accent, borderColor: accent }}
              >
                Preview highlight
              </span>
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Your selected accent and theme are saved on this device.
          </p>

          <button
            type="button"
            onClick={resetAppearance}
            className="mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" />
            Reset appearance
          </button>
        </div>
      </section>

      {/* Account */}
      <section id="account" className="scroll-mt-6 rounded-xl border bg-card p-5">
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
      <section id="privacy" className="scroll-mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Privacy &amp; Security</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Protect your account and information.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Protect your sign-in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Never share your password or verification codes. Review your
                Google account security settings if you use Google sign-in.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Shared devices</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign out when using a shared device and avoid leaving
                confidential legal documents open.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Legal documents</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Only upload documents you are authorized to use. Check the
                applicable privacy policy before uploading sensitive material.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Help */}
      <section id="help" className="scroll-mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Help &amp; Support</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Troubleshooting tips for common problems.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-medium">Sign-in problems</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection, refresh the page, and try signing in
              again if necessary.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Chats or documents not loading</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh RedBot and retry. If the problem continues, keep a note
              of the error message.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Legal answers</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify legislation, judgments and citations against authoritative
              sources. AI responses can contain mistakes.
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
      <section id="about" className="scroll-mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">About RedBot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              RedBot Law Checker helps users explore legal information and work
              with legal documents, with a focus on Malawi law.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">Legal disclaimer</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            RedBot provides legal information, not a substitute for advice from
            a qualified legal professional. AI responses may be inaccurate or
            incomplete. Verify relevant laws, amendments, judgments and
            citations using authoritative sources before relying on an answer
            for legal decisions.
          </p>
        </div>
      </section>

            {/* Delete account */}
      <section
        id="delete-account"
        className="rounded-xl border border-destructive/30 p-6 space-y-4"
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-destructive">
            Delete Account
          </h2>
          <p className="text-sm text-muted-foreground">
            Permanently delete your RedBot account and associated data.
            This action cannot be undone.
          </p>
        </div>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isDeleting}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete My Account
        </Button>
      </section>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and associated data.
              You will not be able to recover it.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();

                setIsDeleting(true);

                try {
                  const { error } = await supabase.functions.invoke(
                    "delete-account"
                  );

                  if (error) {
                    throw error;
                  }

                  await supabase.auth.signOut();
                  navigate({ to: "/login" });
                } catch (error) {
                  console.error("Account deletion failed:", error);

                  toast.error(
                    "Unable to delete your account. Please try again."
                  );
                } finally {
                  setIsDeleting(false);
                  setShowDeleteDialog(false);
                }
              }}
            >
              {isDeleting ? "Deleting..." : "Yes, delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialog>
      </AlertDialog>
    </div>
  );
}
