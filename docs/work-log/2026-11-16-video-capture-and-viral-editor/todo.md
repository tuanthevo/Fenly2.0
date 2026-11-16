# What still needs to be done

## Must do before real users

- [ ] **Test on a real phone over https.** Mobile browsers only allow the
      camera on https or localhost, so plain http over your home network
      won't work. Use a Vercel preview deploy or an https tunnel, then check:
      - guided recording (countdown, 4.5 s auto-stop, the rotate banner)
      - Camera Roll with real phone clips
      - export in **iPhone Safari** (needs Safari 26+ for WebCodecs) and
        Android Chrome
      - Share (opening the phone's share sheet with the MP4 and the caption)
- [x] **Click through "publish without an exported video"** in the browser.
      Done: it publishes, and the listing survives a reload.
- [x] **Keep posted listings across reloads (stopgap).** `src/utils/listingStore.ts`
      saves listings you publish, and their videos, in this browser's IndexedDB.
      Verified: a viral-edit listing and a slideshow listing both came back
      after a reload.
- [ ] **Store media somewhere real.** The on-device save works only in the
      same browser on the same device, and the browser may clear it. Upload
      the MP4 and thumbnails to storage (Supabase is already in `.env.local`)
      and save listings to a database. Media must never go through `/api`,
      because of Vercel's 4.5 MB body limit.
- [ ] **Add a way to delete a posted listing.** There's no delete button, and
      saved listings (with their video files, about 20-60 MB each) build up
      in the browser's storage.
- [ ] **Don't let an export race the Gemini pass.** If "Make my video" is
      clicked before Gemini's wording arrives, the video is marked "made
      before your last change". Wait for the AI pass, or show that it's running.
- [ ] **Decide on the 102 staged skill-folder deletions** (`.adal/`,
      `.agents/`, …). They were already staged before this work and are
      still uncommitted. Commit or restore them on purpose.

## Should do

- [ ] **Open a PR** for `feat/viral-remotion-editor` into `main`. It also
      contains the guided-capture commit.
- [ ] **Restart your dev server on port 3000** so it picks up
      `/api/viral/copy`. Stop the second test server on port 3100 when you're
      done with the browser pane.
- [ ] **Migrate Gemini calls to the Interactions API.** The `gemini-api-dev`
      skill now recommends it. Do every route in one pass, with your
      approval, following `references/migration.md` in that skill.
- [ ] **Add tests for `/api/viral/copy`'s cleanup step**: a hook without the
      exact rent is dropped, a fair-housing violation is dropped, and an
      unknown slot number is ignored. Moving the cleanup into a small pure
      function would make that easy.
- [ ] **Measure performance on a mid-range phone**: how long analysis takes
      and how long export takes (about 42 s on desktop for 5 clips). Add a
      cancel button if it's slow.
- [ ] **Reduce the bundle warnings.** `FenlyViralTour` is imported both
      statically (editor) and dynamically (export), so the dynamic import
      does nothing; the mediabunny encoder chunks are also large. They're
      already lazy, but worth a look.

## Could do later

- [ ] `/api/analyze-clips` (`docs/briefs/analyze-clips.md`): map its windows,
      speeds, hook and caption into the same `ViralAiHints`.
- [ ] Remotion licensing: free for individuals and companies of up to 3
      people. Past that, buy a company license and set
      `VITE_REMOTION_PUBLIC_LICENSE_KEY` (the public key only).
- [ ] Music: the plan supports a music track, but none is shipped. The
      posting tips tell hosts to add a trending sound inside TikTok or Reels.
- [ ] Analytics: track which hook style and pace hosts pick, and how
      exported videos perform, to tune the defaults.
- [ ] Set a git author on this machine (`git config user.name` /
      `user.email`). Commits so far are authored as "Claude".
