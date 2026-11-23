/**
 * Notifications: one row per notification (shown in the app and used as the
 * email outbox), then an email through Resend when RESEND_API_KEY and
 * FENLY_EMAIL_FROM are set. Without them the row is marked "skipped".
 * Never throws: a failed email must not fail the action that caused it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "./supabase.js";
import { buildEmail, type EmailPayload, type NotificationKind, type Email } from "./emails.js";
import { unsubscribeUrl } from "./unsubscribe.js";

export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  listingId?: string | null;
  payload: EmailPayload;
  /** unique; a second notify with the same key does nothing (e.g. one reminder per threshold) */
  dedupeKey?: string;
  appUrl: string;
};

export async function sendEmail(to: string, email: Email, env: NodeJS.ProcessEnv = process.env): Promise<"sent" | "skipped" | { failed: string }> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.FENLY_EMAIL_FROM?.trim();
  if (!key || !from) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        // Mail apps show their own Unsubscribe button from these (RFC 8058 one-click)
        ...(email.unsubscribeUrl
          ? { headers: { "List-Unsubscribe": `<${email.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
    });
    if (res.ok) return "sent";
    const body = await res.text().catch(() => "");
    return { failed: `Resend ${res.status}: ${body.slice(0, 200)}` };
  } catch (error) {
    return { failed: error instanceof Error ? error.message.slice(0, 200) : "network error" };
  }
}

export async function notify(input: NotifyInput, admin: SupabaseClient | null = getAdminClient()): Promise<void> {
  if (!admin) return;
  try {
    const inserted = await admin
      .from("notifications")
      .insert({
        user_id: input.userId,
        kind: input.kind,
        listing_id: input.listingId ?? null,
        payload: input.payload,
        dedupe_key: input.dedupeKey ?? null,
      })
      .select("id")
      .single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") console.error("notify insert:", inserted.error.message);
      return;
    }
    const id = inserted.data.id as string;
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from("users").select("notify_email").eq("id", input.userId).maybeSingle(),
      admin.auth.admin.getUserById(input.userId),
    ]);
    const to = authUser?.user?.email;
    let status: "sent" | "skipped" | "failed" = "skipped";
    let emailError: string | null = null;
    if (to && profile?.notify_email !== false) {
      const footer = { unsubscribeUrl: unsubscribeUrl(input.appUrl, input.userId), postalAddress: process.env.FENLY_POSTAL_ADDRESS };
      const result = await sendEmail(to, buildEmail(input.kind, input.payload, input.appUrl, footer));
      if (typeof result === "object") {
        status = "failed";
        emailError = result.failed;
      } else status = result;
    }
    await admin.from("notifications").update({ email_status: status, email_error: emailError }).eq("id", id);
  } catch (error) {
    console.error("notify failed:", error instanceof Error ? error.message : error);
  }
}
