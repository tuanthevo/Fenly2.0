import test from "node:test";
import assert from "node:assert/strict";
import { unsubscribeUrl, unsubscribeToken, validUnsubscribeToken } from "./unsubscribe";
import { buildEmail } from "./emails";

const env = { CRON_SECRET: "a-long-enough-secret-123" } as NodeJS.ProcessEnv;
const user = "3f2b8c1e-1111-4222-8333-444455556666";

test("unsubscribe links are signed per user and checked", () => {
  const token = unsubscribeToken(user, env)!;
  assert.equal(token.length, 40);
  assert.ok(validUnsubscribeToken(user, token, env));
  assert.equal(validUnsubscribeToken("3f2b8c1e-1111-4222-8333-444455556667", token, env), false, "another user's token");
  assert.equal(validUnsubscribeToken(user, token.replace(/.$/, "0") === token ? token.replace(/.$/, "1") : token.replace(/.$/, "0"), env), false);
  assert.equal(validUnsubscribeToken(user, "", env), false);
  assert.equal(unsubscribeUrl("https://fenly.app/", user, env), `https://fenly.app/api/unsubscribe?u=${user}&t=${token}`);
  assert.equal(unsubscribeUrl("https://fenly.app", user, {} as NodeJS.ProcessEnv), null, "no secret, no link");
});

test("emails carry the unsubscribe link and the postal address when set", () => {
  const url = unsubscribeUrl("https://fenly.app", user, env)!;
  const email = buildEmail("new_rooms", { area: "Mission", rooms: [], total: 0 }, "https://fenly.app", { unsubscribeUrl: url, postalAddress: "1 Main St <Suite 2>, San Jose, CA" });
  assert.ok(email.text.includes(`Unsubscribe from all Fenly emails: ${url}`));
  assert.ok(email.html.includes("Unsubscribe</a>"));
  assert.ok(email.html.includes("1 Main St &lt;Suite 2&gt;"), "address is escaped");
  assert.equal(email.unsubscribeUrl, url);
  const plain = buildEmail("new_rooms", { area: "Mission", rooms: [], total: 0 }, "https://fenly.app");
  assert.ok(!plain.text.includes("Unsubscribe from all"));
});
