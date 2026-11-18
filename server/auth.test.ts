import test from "node:test";
import assert from "node:assert/strict";
import { optionalUser, requireUser, type AuthedUser } from "./auth";
import { looksLikeSecretKey, publicSupabaseConfig } from "./supabase";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl";
const USER: AuthedUser = { id: "11111111-1111-4111-8111-111111111111", email: null, phone: null };

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    locals: {} as Record<string, unknown>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

async function run(mw: ReturnType<typeof requireUser>, authorization?: string) {
  const res = fakeRes();
  let nextCalled = false;
  await mw({ headers: { authorization } } as never, res as never, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test("requireUser: no token -> 401 sign_in_required, verifier never called", async () => {
  let calls = 0;
  const { res, nextCalled } = await run(requireUser(async () => (calls++, USER)));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "sign_in_required" });
  assert.equal(calls, 0);
});

test("requireUser: rejected token -> 401, verifier error -> 503", async () => {
  const rejected = await run(requireUser(async () => null), `Bearer ${JWT}`);
  assert.equal(rejected.res.statusCode, 401);
  assert.deepEqual(rejected.res.body, { error: "invalid_session" });

  const down = await run(
    requireUser(async () => {
      throw new Error("network");
    }),
    `Bearer ${JWT}`
  );
  assert.equal(down.res.statusCode, 503);
  assert.equal(down.nextCalled, false);
});

test("requireUser: valid token -> next() with res.locals.user", async () => {
  const { res, nextCalled } = await run(requireUser(async (token) => (token === JWT ? USER : null)), `Bearer ${JWT}`);
  assert.equal(nextCalled, true);
  assert.deepEqual(res.locals.user, USER);
});

test("optionalUser never blocks", async () => {
  const anon = await run(optionalUser(async () => USER));
  assert.equal(anon.nextCalled, true);
  assert.equal(anon.res.locals.user, undefined);
  const broken = await run(
    optionalUser(async () => {
      throw new Error("x");
    }),
    `Bearer ${JWT}`
  );
  assert.equal(broken.nextCalled, true);
});

function fakeJwt(payload: object) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

test("looksLikeSecretKey catches new secret keys and legacy service_role JWTs", () => {
  assert.equal(looksLikeSecretKey("sb_secret_abc"), true);
  assert.equal(looksLikeSecretKey(fakeJwt({ role: "service_role" })), true);
  assert.equal(looksLikeSecretKey(fakeJwt({ role: "anon" })), false);
  assert.equal(looksLikeSecretKey("sb_publishable_abc"), false);
});

test("publicSupabaseConfig never hands a secret key to the browser", () => {
  const url = "https://abc.supabase.co/";
  assert.deepEqual(publicSupabaseConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }), {
    url: "https://abc.supabase.co",
    publishableKey: "sb_publishable_x",
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(publicSupabaseConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" }), null);
  } finally {
    console.error = originalError;
  }
  assert.equal(publicSupabaseConfig({ SUPABASE_URL: url }), null);
  assert.equal(publicSupabaseConfig({ SUPABASE_URL: "http://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" }), null);
  assert.notEqual(publicSupabaseConfig({ SUPABASE_URL: "http://localhost:54321", SUPABASE_PUBLISHABLE_KEY: "k" }), null);
});
