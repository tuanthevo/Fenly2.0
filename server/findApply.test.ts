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
