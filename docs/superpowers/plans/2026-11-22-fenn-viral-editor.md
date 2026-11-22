# Fenn Viral Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hosts film standing still with one slow move per shot; Fenn cuts each clip to its steadiest 3-5 s, scores the edit out of 20 and keeps the best cut.

**Architecture:** Three pure modules change (`guidedShots.ts`, `clipSignals.ts`, `plan.ts`) and one is added (`fennScore.ts`); the editor screen reads the score. A new length preset `fenn` carries the timing, so saved `full` / `teaser` edits keep working.

**Tech Stack:** TypeScript, React 19, Remotion, node:test through `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-22-fenn-viral-editor-design.md`

## Global Constraints

- No instruction, tip or reminder tells the host to walk or step.
- Playback stays 1.0-1.15x. Fair-housing and person-in-shot rules are untouched.
- Recording length (`GUIDED_RECORDING_MS`) and the 3 required Quick Tour shots do not change.
- Timing rules in `plan.ts` change only with `plan.test.ts`.
- No emoji in burned-in text; brand colors and components unchanged; UI work follows `impeccable`.
- Branch `feat/2.0-fenn-editor`, merged into `fenly-2.0` with `--no-ff` after `npm run lint` and `npm test`.

## Review Focus

1. A saved edit made before today (analysis without `steady`): must still plan and score without errors.
2. A clip with under 3 s of clean footage: gives a shorter shot at 1.0x, never a slowed one, and the score names that clip.
3. A camera-roll upload of 30 s+: shots stay 3-5 s; the video is not padded or cut to a target.
4. One clip only: plan and score still work (no re-hook, no crash).
5. A listing with no rent: the caption and the hook-copy score row do not print "$undefined" or throw.

---

### Task 1: Filming instructions without walking

**Files:** Modify `src/utils/guidedShots.ts`, `src/remotion/viral/clipSignals.ts` (`WARNING_TIPS`), `src/components/GuidedShotCapture.tsx` (only if it holds its own "walk" strings). Test: `src/utils/guidedShots.test.ts` (create or extend).

**Interfaces:** Produces `GuidedShot.move: 'slide' | 'push' | 'turn'`.

- [ ] Test `no filming copy tells the host to walk`: every `instruction`, `movementCue`, `GUIDED_PRE_SHOT_REMINDER` and `WARNING_TIPS` value fails `/\b(walk|step|steps)\b/i`.
- [ ] Test `neighbouring shots use different moves`: `GUIDED_SHOTS[i].move !== GUIDED_SHOTS[i+1].move`.
- [ ] Run, see both fail.
- [ ] Rewrite the five shots with the copy in the spec's table (keep "(7 sec)" at the end so `instructionFor` still swaps the length); reminder `Lights on • Feet planted • One slow move`; tips: shaky → "This shot is shaky. Plant your feet, hold the phone with both hands and move slower.", blank → "This shot is mostly wall. Stand in the doorway facing into the room."
- [ ] Run tests, commit.

### Task 2: The steadiest window of a clip

**Files:** Modify `src/remotion/viral/clipSignals.ts`, `types.ts`. Test: `clipSignals.test.ts`.

**Interfaces:** Produces
`findSteadyWindow(samples: ClipSample[], range: ClipRange, opts?: { minSec?: number; maxSec?: number; sampleFps?: number }): SteadyWindow | null` and `ClipAnalysis.steady?: SteadyWindow`, where
`SteadyWindow = { startSec: number; endSec: number; shake: number; meanMotion: number }`. `shake` is 0 (steady) to 1: `0.6 * (1 - clamp((meanCorr - 0.6) / 0.35, 0, 1)) + 0.4 * clamp(motionStd / 0.04, 0, 1)`. Constants `FENN_SHOT_MIN_SEC = 3`, `FENN_SHOT_MAX_SEC = 5`, `SHAKE_RETAKE = 0.55`, `FAST_MOTION = 0.11`.

- [ ] Test: samples steady for 0-2 s, shaky 2-4 s, steady 4-9 s → window starts at ≥ 4 s and is 5 s long.
- [ ] Test: a clean range of 2 s → a 2 s window (never null while the range has 2+ samples).
- [ ] Test: `analyzeSamples` on all-shaky samples adds one `shaky` retake warning with tip "Try that one slower. Feet planted, one slow move." (no duplicate `shaky`).
- [ ] Implement: slide a `maxSec` window (shrunk to the range) over samples inside `range`, lowest `shake` wins, first frame must pass the existing opening check when any window does. `analyzeSamples` stores it; `steady.shake > SHAKE_RETAKE` or `steady.meanMotion > FAST_MOTION` gives the warning.
- [ ] Run tests, commit.

### Task 3: The `fenn` length preset

**Files:** Modify `types.ts` (`ViralLength` adds `'fenn'`), `plan.ts`, `editSettings.ts`, `ViralVideoEditor.tsx` default. Test: `plan.test.ts`, `editSettings.test.ts`.

**Interfaces:** Consumes `ClipAnalysis.steady`. Produces `LENGTH_PRESETS.fenn` (`label 'Fenn', approxLabel 'as long as your shots', heroFactsSec 2, tourSec 5, minTourSec 3, closerSec 4, endCardSec 3.2`, hook and rates as `full`, `details: true`), `FENN_MOMENT_SEC = 4.5`, `REHOOK_MIN_TOTAL_SEC = 15`.

- [ ] Test: 3 clips of 7 s with analysis → every tour shot lasts 3-5 s, every rate is 1-1.15, total under 25 s.
- [ ] Test: a tour shot starts at its clip's `steady.startSec` (within one frame) when that fits the clean range.
- [ ] Test: a 30 s clip + 2 short ones → no shot over 5 s (the closer's end card excluded); nothing padded.
- [ ] Test: one clip → plan passes `checkPlan`, no re-hook.
- [ ] Test: analysis without `steady` → plan passes `checkPlan`.
- [ ] Test (`editSettings`): defaults use `fenn`; a saved `'full'` stays `'full'`.
- [ ] Implement: `fenn` behaves as `full` wherever the code checks `length === 'full'` (splits, re-hook placement, details); split moments use `FENN_MOMENT_SEC`; tour shots prefer `steady.startSec`; re-hook skipped under `REHOOK_MIN_TOTAL_SEC`.
- [ ] Run `npx tsx --test src/remotion/viral/*.test.ts`, commit.

### Task 4: Fenn's score

**Files:** Create `src/remotion/viral/fennScore.ts`, `fennScore.test.ts`.

**Interfaces:** Produces
`scoreEdit(plan: ViralEditPlan, clips: ViralClipInput[]): FennScore`,
`FennScore = { score: number; rows: { id: FennRowId; label: string; points: 0 | 1 | 2; reason?: string }[]; fix: { slotNumber?: number; tip: string } | null }`,
`bestFennEdit(input: BuildViralPlanInput, options: BuildViralPlanOptions): { plan: ViralEditPlan; score: FennScore }`, `FENN_PASS = 18`.
Rows follow `audit.md` 1-10: frame0, hookCopy, readability, placement, readingTime, changeRate, shots (speed + 3-5 s), steadiness (openings + shake), look, ending.

- [ ] Test: a clean 3-clip plan scores ≥ 18 and `fix` is null.
- [ ] Test: one clip with `steady.shake = 0.8` loses points on `steadiness`, and `fix.slotNumber` is that clip's slot with a tip that has no "walk".
- [ ] Test: a hook without the rent scores `hookCopy` ≤ 1; a listing with no rent does not throw.
- [ ] Test: `bestFennEdit` never returns a lower score than the plain plan, and returns the plain plan when the user chose the opener.
- [ ] Implement. Candidates for `bestFennEdit`: the plain plan, plus one per other hook slot (top 2 by hook score) when the user has not chosen an opener.
- [ ] Run tests, commit.

### Task 5: Score on the editor screen

**Files:** Modify `src/components/ViralVideoEditor.tsx`.

- [ ] For `length === 'fenn'` build with `bestFennEdit`; show "Fenn's score N/20" (`data-testid="fenn-score"`) near the status line, and under 18 the one-line `fix.tip`. Existing colors: small orange text `#A9513A`, body `#6E655F`. Never block export.
- [ ] Add `fenn` to the length picker on the edit screen.
- [ ] Check in the browser preview with the sample clips; lint.
- [ ] Commit.

### Task 6: Instagram caption rules

**Files:** Modify `src/fill/sharePosts.ts`, `src/fill/fill.test.ts`.

- [ ] Test: the Instagram caption's first 125 characters contain the rent and the area; no `http` anywhere in it; at most 5 hashtags, none of `#viral #fyp #explorepage #foryou`; exactly one ask line ("Tour and apply: link in bio"). Replace the old "includes the url" assertion (the bio-link button in `ShareKit` already copies the link).
- [ ] Test: no rent → no "$" and no "undefined".
- [ ] Implement, run `npm test`, commit.

### Task 7: Audit, docs, merge

- [ ] Render the host's clips through the app path, pull frames, score by eye with `audit.md`; record computed and by-eye scores in the playbook's audit log.
- [ ] Update `docs/viral-playbook.md` (timing table, rule map), `fenly-viral-editor/SKILL.md` (filming rule: never walk; `fenn` preset), `CLAUDE.md` viral section.
- [ ] `npm run lint`, `npm test`; merge into `fenly-2.0` with `--no-ff`.
