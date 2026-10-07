import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function codeEmail(title: string, intro: string, code: string) {
  return `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:24px;color:#222">
  <h2 style="color:#b91c1c;margin:0 0 8px">RedBot Law Checker</h2>
  <h3 style="margin:0 0 16px">${title}</h3>
  <p>${intro}</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;background:#f7f1e3;padding:16px;border-radius:8px">${code}</p>
  <p style="color:#666;font-size:13px">This code expires soon. If you didn't request it, you can ignore this email.</p>
</div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  if (!lovableKey || !resendKey) throw new Error("Email service is not configured");
  const from = process.env["RESEND_FROM"] || "RedBot Law Checker <onboarding@resend.dev>";
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend failed [${res.status}]: ${body}`);
    throw new Error("We couldn't send the email right now. Please try again.");
  }
}

export const sendSignupCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email().max(255), password: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let res = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: data.email,
      password: data.password,
    });
    if (res.error && /already|registered|exists/i.test(res.error.message)) {
      // Existing but unconfirmed account: send a fresh code without changing the password.
      res = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: data.email });
      if (!res.error && res.data.user?.email_confirmed_at) {
        return { ok: false as const, error: "An account with this email already exists. Please sign in." };
      }
    }
    if (res.error || !res.data.properties?.email_otp) {
      console.error("generateLink signup failed", res.error);
      return { ok: false as const, error: "Could not start sign up. Please try again." };
    }
    await sendEmail(
      data.email,
      "Your RedBot Law Checker verification code",
      codeEmail("Verify your email", "Enter this code to finish creating your account:", res.data.properties.email_otp),
    );
    return { ok: true as const, type: res.data.properties.verification_type };
  });

export const sendRecoveryCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: data.email });
    // Same reply whether or not the account exists, so emails can't be probed.
    if (res.error || !res.data.properties?.email_otp) return { ok: true as const };
    await sendEmail(
      data.email,
      "Reset your RedBot Law Checker password",
      codeEmail("Password reset", "Enter this code to choose a new password:", res.data.properties.email_otp),
    );
    return { ok: true as const };
  });
