import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SCAN_FRAMES, parseFrameNotes, scanFramesFrom } from "./frameNotes.js";

test("scan frames: only valid times and small base64 JPEGs, capped per shot", () => {
  const ok = { t: 1.234, jpegBase64: "QUJD" };
  const frames = scanFramesFrom([ok, { t: -1, jpegBase64: "QUJD" }, { t: 2, jpegBase64: "<script>" }, { t: "x", jpegBase64: "QUJD" }, { t: 3, jpegBase64: "A".repeat(200_000) }]);
  assert.deepEqual(frames, [{ t: 1.23, jpegBase64: "QUJD" }]);
  assert.equal(scanFramesFrom(Array.from({ length: 30 }, (_, k) => ({ t: k, jpegBase64: "QUJD" }))).length, MAX_SCAN_FRAMES);
  assert.deepEqual(scanFramesFrom("nope"), []);
});

test("frame notes: kept only for frames that were sent, labels cleaned, people flagged", () => {
  const sent = { 2: [{ t: 0.6, jpegBase64: "x" }, { t: 1.8, jpegBase64: "x" }] };
  const clean = (s: unknown) => (typeof s === "string" && s.length <= 22 && !/perfect for/i.test(s) ? s : undefined);
  const notes = parseFrameNotes(
    [
      { slotNumber: 2, t: 1.8, label: "Kitchen island", person: true },
      { slotNumber: 2, t: 0.61, label: "Sectional sofa" },
      { slotNumber: 2, t: 0.6, label: "Duplicate" },
      { slotNumber: 2, t: 5, label: "Never sent" },
      { slotNumber: 4, t: 0.6, label: "Wrong slot" },
      { slotNumber: 2, t: 1.8, label: "Perfect for couples" },
    ],
    sent,
    clean
  );
  assert.deepEqual(notes, { 2: [{ t: 0.6, label: "Sectional sofa" }, { t: 1.8, label: "Kitchen island", person: true }] });
});
