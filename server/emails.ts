/**
 * Email content for notifications (pure; server/notify.ts sends them).
 * Every value is HTML-escaped. Emails carry first names and room areas only,
 * never addresses, documents or anything from a Passport beyond what the
 * recipient already sees in the app.
 */
import { escapeHtml } from "../src/fill/publicListing.js";

export const NOTIFICATION_KINDS = [
  "new_applicant",
  "chosen",
  "declined",
  "room_taken",
  "move_out_reminder",
  "id_check_requested",
  "new_rooms",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type EmailPayload = {
  area?: string;
  firstName?: string | null;
  message?: string | null;
  daysLeft?: number;
  applicantCount?: number;
  similar?: { area: string; rent: string; url: string }[];
  /** new_rooms: the rooms in the digest, and how many matched in all */
  rooms?: { area: string; rent: string; url: string }[];
  total?: number;
  /** deep link back into the app */
  path?: string;
};

export type Email = { subject: string; text: string; html: string };

/** Days-before-move-out reminders. */
export const MOVE_OUT_REMINDER_DAYS = [14, 7, 3] as const;

/**
 * Which reminder is due today: the tightest threshold we've reached that
 * hasn't been sent. Skips older ones (a room listed 5 days out gets only the
 * 3-day reminder, not three at once).
 */
export function moveOutReminderDue(daysLeft: number | null, sent: number[]): number | null {
  if (daysLeft == null || daysLeft < 0) return null;
  const reached = [...MOVE_OUT_REMINDER_DAYS].filter((t) => daysLeft <= t).sort((a, b) => a - b);
  const tightest = reached[0];
  return tightest != null && !sent.includes(tightest) ? tightest : null;
}

function link(appUrl: string, path = "/"): string {
  return `${appUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildEmail(kind: NotificationKind, p: EmailPayload, appUrl: string): Email {
  const area = p.area || "your area";
  const hi = p.firstName?.trim() ? `Hi ${p.firstName.trim()},` : "Hi,";
  const open = link(appUrl, p.path ?? "/");
  let subject: string;
  let lines: string[];
  let cta: string;
  switch (kind) {
    case "new_applicant":
      subject = `New applicant for your room in ${area}`;
      lines = [
        hi,
        `Someone just applied for your room in ${area}${p.applicantCount && p.applicantCount > 1 ? ` (${p.applicantCount} applicants so far)` : ""}.`,
        "Open Fenly to see their Passport, shortlist them or send a message.",
      ];
      cta = "See applicants";
      break;
    case "chosen":
      subject = `You got the room in ${area}`;
      lines = [hi, `Good news: the host chose you for the room in ${area}.`, "Open Fenly to message them and sort out the next steps."];
      cta = "Open the conversation";
      break;
    case "declined":
      subject = `Update on the room in ${area}`;
      lines = [hi, p.message?.trim() || `The host went with another applicant for the room in ${area}.`, "There are new rooms in Find every week."];
      cta = "Find another room";
      break;
    case "room_taken":
      subject = `The room in ${area} is taken`;
      lines = [
        hi,
        `The room in ${area} you applied for has been filled.`,
        ...(p.similar?.length
          ? [`Here ${p.similar.length === 1 ? "is a similar room" : `are ${p.similar.length} similar rooms`} nearby:`, ...p.similar.map((s) => `${s.area}, ${s.rent}/mo: ${s.url}`)]
          : ["New rooms show up in Find every week."]),
      ];
      cta = "See rooms nearby";
      break;
    case "move_out_reminder":
      subject = `${p.daysLeft} days until you move out`;
      lines = [
        hi,
        `You move out of your room in ${area} in ${p.daysLeft} days and it isn't filled yet.`,
        "Repost your link today: a new group or a fresh post usually brings the next applicants.",
      ];
      cta = "Open your share kit";
      break;
    case "new_rooms": {
      const total = p.total ?? p.rooms?.length ?? 0;
      const more = total - (p.rooms?.length ?? 0);
      subject = `${total} new ${total === 1 ? "room fits" : "rooms fit"} your Passport`;
      lines = [
        hi,
        `New ${total === 1 ? "room" : "rooms"} near ${area} that fit your budget, move-in date and stay:`,
        ...(p.rooms ?? []).map((r) => `${r.area}, ${r.rent}/mo: ${r.url}`),
        ...(more > 0 ? [`And ${more} more in Fenly.`] : []),
        "You get this once a day at most. Turn it off in your Passport.",
      ];
      cta = "See rooms in Find";
      break;
    }
    case "id_check_requested":
      subject = `The host in ${area} asked for an ID check`;
      lines = [
        hi,
        `You're on the shortlist for the room in ${area}. The host asked you to verify your ID.`,
        "It takes a minute. The host only sees a badge, never your document.",
      ];
      cta = "Verify my ID";
      break;
  }
  const manage = link(appUrl, "/?passport=settings");
  const text = [...lines, "", `${cta}: ${open}`, "", `Email settings: ${manage}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#F9F7F3;font-family:Helvetica,Arial,sans-serif;color:#2C2724">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<div style="font-weight:800;font-size:20px;color:#D06C4E;margin-bottom:18px">Fenly</div>
${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(l)}</p>`).join("\n")}
<p style="margin:22px 0"><a href="${escapeHtml(open)}" style="background:#D06C4E;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px;display:inline-block">${escapeHtml(cta)}</a></p>
<p style="font-size:12px;color:#6E655F;margin-top:28px"><a href="${escapeHtml(manage)}" style="color:#6E655F">Email settings</a></p>
</div></body></html>`;
  return { subject, text, html };
}
