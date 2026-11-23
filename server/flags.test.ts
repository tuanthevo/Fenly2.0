import test from "node:test";
import assert from "node:assert/strict";
import { getFlags, requireFlag, requireFlagOrAdmin } from "./flags";
import { DEFAULT_FLAGS, resolveFlags } from "../src/config/featureFlags";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
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

test("getFlags reads FENLY_FLAGS on top of the all-hidden default", () => {
  assert.deepEqual(getFlags({}), { ...DEFAULT_FLAGS });
  assert.equal(getFlags({ FENLY_FLAGS: "ask_fenn" }).ask_fenn, true);
  assert.equal(getFlags({ FENLY_FLAGS: "ask_fenn" }).scout, false);
});

test("requireFlag 404s while the flag is off and passes through when on", () => {
  const off = fakeRes();
  let called = false;
  requireFlag("ask_fenn", () => ({ ...DEFAULT_FLAGS }))({} as never, off as never, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(off.statusCode, 404);
  assert.deepEqual(off.body, { error: "feature_off", feature: "ask_fenn" });

  const on = fakeRes();
  requireFlag("ask_fenn", () => resolveFlags(DEFAULT_FLAGS, { ask_fenn: true }))({} as never, on as never, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(on.statusCode, 200);
});

test("requireFlagOrAdmin: off for everyone but admins until the flag is on", () => {
  const run = (flagOn: boolean, admin: boolean) => {
    const res = fakeRes();
    let called = false;
    requireFlagOrAdmin(
      "photo_listings",
      () => resolveFlags(DEFAULT_FLAGS, { photo_listings: flagOn }),
      () => admin
    )({} as never, res as never, () => {
      called = true;
    });
    return { called, status: res.statusCode, body: res.body };
  };
  assert.deepEqual(run(false, false), { called: false, status: 404, body: { error: "feature_off", feature: "photo_listings" } });
  assert.equal(run(false, true).called, true);
  assert.equal(run(true, false).called, true);
  assert.equal(getFlags({}).photo_listings, false);
  assert.equal(getFlags({ FENLY_FLAGS: "photo_listings" }).photo_listings, true);
});
