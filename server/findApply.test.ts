import test from "node:test";
import assert from "node:assert/strict";
import { hashInviteToken, inviteProblem, inviteUrl, isInviteToken, newInviteToken, INVITE_TTL_MS } from "./invites";
import { buildEmail, moveOutReminderDue, NOTIFICATION_KINDS } from "./emails";

test("invite tokens: 32 url-safe chars, hashed, single use, expiring", () => {
  const token = newInviteToken();
  assert.ok(isInviteToken(token), token);
  assert.notEqual(newInviteToken(), token);
  assert.equal(newInviteToken(() => Buffer.alloc(24, 0)), "A".repeat(32));
  assert.match(hashInviteToken(token), /^[0-9a-f]{64}$/);
  assert.equal(hashInviteToken("abc"), hashInviteToken("abc"));
  assert.ok(!isInviteToken("short"));
  assert.ok(!isInviteToken("x".repeat(31) + "!"));
  const now = Date.parse("2026-11-18T12:00:00Z");
  assert.equal(inviteProblem(null, now), "not_found");
  assert.equal(inviteProblem({ expires_at: new Date(now + INVITE_TTL_MS).toISOString(), used_by: null }, now), null);
  assert.equal(inviteProblem({ expires_at: new Date(now - 1).toISOString(), used_by: null }, now), "expired");
  assert.equal(inviteProblem({ expires_at: new Date(now + 1000).toISOString(), used_by: "u" }, now), "used");
  assert.equal(inviteUrl("https://fenly.app/", "tok"), "https://fenly.app/?house=tok");
});

test("move-out reminders: 14, 7 and 3 days, the tightest unsent one only", () => {
  assert.equal(moveOutReminderDue(20, []), null);
  assert.equal(moveOutReminderDue(14, []), 14);
  assert.equal(moveOutReminderDue(13, [14]), null);
  assert.equal(moveOutReminderDue(7, [14]), 7);
  assert.equal(moveOutReminderDue(5, []), 7);
  assert.equal(moveOutReminderDue(2, [14]), 3, "skips the missed 7-day one");
  assert.equal(moveOutReminderDue(2, [3]), null);
  assert.equal(moveOutReminderDue(-1, []), null);
  assert.equal(moveOutReminderDue(null, []), null);
});

test("emails: every kind builds, values are escaped, settings link included", () => {
  for (const kind of NOTIFICATION_KINDS) {
    const email = buildEmail(kind, { area: "Mission", firstName: "Sam", daysLeft: 7, path: "/?inbox=1" }, "https://fenly.app");
    assert.ok(email.subject.length > 0 && email.subject.length < 80, kind);
    assert.ok(email.text.includes("https://fenly.app/?passport=settings"), kind);
    assert.ok(email.html.includes("https://fenly.app/?inbox=1"), kind);
  }
  const evil = buildEmail("declined", { area: "<b>x</b>", message: '<script>alert("x")</script>' }, "https://fenly.app");
  assert.ok(!evil.html.includes("<script>"));
  assert.ok(evil.html.includes("&lt;script&gt;"));
  const taken = buildEmail("room_taken", { area: "Mission", similar: [{ area: "Noe Valley", rent: "$1,500", url: "https://fenly.app/r/abcd1234" }] }, "https://fenly.app");
  assert.ok(taken.text.includes("Noe Valley, $1,500/mo: https://fenly.app/r/abcd1234"));
});

test("admin emails and the cron secret gate their routes", async () => {
  const { isAdminUser } = await import("./routeKit");
  const { isCronRequest } = await import("./adminRoutes");
  const env = { FENLY_ADMIN_EMAILS: "Owner@Example.com, ops@example.com" } as NodeJS.ProcessEnv;
  assert.ok(isAdminUser({ email: "owner@example.com" }, env));
  assert.ok(isAdminUser({ email: " OPS@example.com " }, env));
  assert.ok(!isAdminUser({ email: "someone@example.com" }, env));
  assert.ok(!isAdminUser({ email: null }, env));
  assert.ok(!isAdminUser({ email: "owner@example.com" }, {} as NodeJS.ProcessEnv));
  const secret = "s".repeat(32);
  assert.ok(isCronRequest(`Bearer ${secret}`, secret));
  assert.ok(!isCronRequest(`Bearer ${secret}x`, secret));
  assert.ok(!isCronRequest(undefined, secret));
  assert.ok(!isCronRequest("Bearer short", "short"), "a weak secret never works");
  assert.ok(!isCronRequest("Bearer ", undefined));
});

test("intro and ID image checks", async () => {
  const { validIdImage } = await import("./idCheck");
  const big = "A".repeat(4000);
  assert.ok(validIdImage(big, "image/jpeg"));
  assert.equal(validIdImage(big, "application/pdf"), null);
  assert.equal(validIdImage("abc", "image/png"), null, "too small");
  assert.equal(validIdImage("A".repeat(4_100_000), "image/png"), null, "too big");
  assert.equal(validIdImage("<script>".repeat(200), "image/png"), null);
});
