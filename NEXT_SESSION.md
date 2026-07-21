# Next Session — Validate MJ Scraping (Round 2)

**Status at end of last session:** commit `0e92cc4` shipped — layout-broken banner (FR-MJ-9), capture-error tray (NFR-ROB-1), 8s fetch timeout (NFR-PERF-2), and defensive scrape hardening (widened CDN, srcset-based full-res upgrade, container jobId fallback, cache-buster stripping). SRS was amended to drop the File System Access sync scope; ZIP export is now the primary deliverable.

**None of the scraping heuristics have been tested against the real Midjourney DOM.** The banner and error tray now give us visible failure surfaces, but the scrape code itself still needs live validation before we can trust any downstream outfit exports.

**Goal for this session:** run every checklist item below against `midjourney.com`, patch selectors where they fail, and then decide whether to knock off the mid-tier gaps (see the bottom of this file).

---

## Setup (2 minutes)

1. `npm run dev` in `D:\Projects\DesignWorkFlow` (Vite writes to `dist/` with HMR).
2. `chrome://extensions` → reload the extension.
3. Open `https://www.midjourney.com/home` (or `/archive` / `/imagine`) → open DevTools console.
4. Open the extension side panel and create a fresh test collection ("Scrape test v2").

---

## Checklist — what to verify

Tick each. If any fail, jump to the corresponding fix section below.

### Content script + button injection

- [ ] **A. Content script loads** — MJ tab console shows `[MJ Designer Workflow] content script loaded on ...`
- [ ] **B. `+` button appears on every MJ image tile** — hover any generation and confirm the top-right `+` shows up
- [ ] **B2. Layout banner stays hidden on real MJ pages** — after ~3s (probe delay 2.5s), no yellow banner in the side panel. If it fires, `MJ_CDN_PATTERNS` in `mj-scrape.ts` no longer matches real URLs.
- [ ] **B3. Layout banner fires on a broken match** — temporarily break the regex (`/this-will-never-match/i`), reload, refresh MJ → banner shows the expected reason string, dismiss persists. Then restore.

### Staging capture

- [ ] **C. Button click stages the image** — click `+`, watch for `…` → `✓`, thumbnail appears in side panel within ~3s
- [ ] **C2. Timeout path shows in error tray** — DevTools Network → set to "Offline" → click `+` on an unstaged tile → after 8s a red row appears in the side panel error tray with `timeout after 8000ms`. Restore network.
- [ ] **D. Thumbnail is full-resolution** — right-click the staged thumbnail in the side panel → "Save image", open it, confirm it's high-res (not a 384px or 512px thumbnail)
- [ ] **D2. srcset was used when present** — in DevTools, temporarily add `console.log('[MJDW] upgraded', src, '→', upgraded)` inside `extractMetadata` (or set a breakpoint). Confirm the upgraded URL comes from the largest srcset entry when the `<img>` has one, and only falls back to the size-hint regex when there is no srcset.
- [ ] **D3. Fallback lowResolution flag** — force full-res fetch to fail (temporarily rewrite `upgradeToFullRes` to return a bogus URL) → confirm staging still succeeds via the DOM `<img>` src and `metadata.lowResolution === true` in IndexedDB.

### Metadata

- [ ] **E. Prompt is captured** — DevTools → Application → IndexedDB → `designworkflow` → `staging`. `metadata.prompt` should hold the MJ prompt text.
- [ ] **F. Job ID is captured** — same row, `metadata.jobId` should be a UUID. Try tiles where the URL contains a UUID and tiles where it doesn't; the container-attribute fallback (`data-job-id`, `data-jobid`, `data-job`, `a[href*="jobs/"]`) should cover the latter.
- [ ] **F2. mjParams parses** — pick a tile whose prompt ends with `--ar 2:3 --v 6.1`; confirm `metadata.mjParams` contains those keys.
- [ ] **F3. mjTimestamp captured** — if MJ renders a `<time datetime="…">` in the tile, `metadata.mjTimestamp` should be a millisecond epoch.

### Dedup + resync

- [ ] **G. Dedup works** — click `+` on the same image twice; should stay at one row in staging
- [ ] **G2. Cache-buster dedup** — force MJ to serve two different `?method=…` variants of the same asset (or manually stage two URLs that differ only in `method`/`qst`/`ts` query params) → still dedups to one row. This tests `stripCacheBuster`.
- [ ] **H. SPA navigation still works** — scroll/paginate MJ; new images that load should also get `+` buttons (MutationObserver)
- [ ] **I. Remove works round-trip** — hover staged thumb in side panel, click `×`, confirm MJ page button reverts to `+`
- [ ] **J. Reload persistence** — refresh MJ page; images that are still staged should re-show `✓` (via `IS_STAGED` hydration)

---

## Fix sections (by likely failure)

All paths below are relative to `D:\Projects\DesignWorkFlow\`.

### If B fails (no `+` button on any images)
The CDN regex in `src/shared/mj-scrape.ts` doesn't match MJ's current URLs.

1. On the MJ page, right-click any image → "Inspect". Look at the `<img>` tag's `src`, `srcset`, and `currentSrc`.
2. Copy 2–3 sample URLs. If they aren't served from `cdn.midjourney.com` or `midjourneyusercontent.com`, widen `MJ_CDN_PATTERNS`.
3. If images are `background-image` on a `<div>` instead of `<img>`, `findImageTiles` needs a second scanner that walks elements and reads `getComputedStyle(el).backgroundImage`.

### If D fails (thumbnail is low-res) or D2 fails (srcset ignored)
`upgradeToFullRes` isn't finding the widest source.

1. Inspect an `<img>` and copy its `srcset`. If MJ uses non-standard descriptors, extend `largestFromSrcset` to handle them.
2. If MJ doesn't expose `srcset` at all, revisit the size-hint regex. Note the exact segment MJ uses (the number, the file extension, whether there's a `_N` suffix or something new) and update the replace pattern.
3. If MJ requires a signed URL for full-res, `stripCacheBuster` is preserving signature params correctly — but confirm that `Signature`, `Expires`, `Key-Pair-Id` are still present after the strip.

### If E fails (no prompt captured)
`findPromptText` walked the DOM but didn't find prompt text.

1. Inspect an image tile. Walk up 3–5 ancestors and find the element that contains the prompt string.
2. Note its class, `data-testid`, `aria-label`, or role.
3. Add a targeted selector at the top of `findPromptText` before the generic p/span/div walk.

### If F fails (no job ID)
The URL didn't contain a UUID and the container fallback didn't fire.

1. Check whether MJ URLs include a UUID at all. If not, inspect the tile container and look for `data-job-id`, `data-jobid`, `data-job`, or an anchor to a job detail page.
2. Update `extractJobIdFromContainer` to match whichever selector MJ uses. Keep the existing selectors as fallbacks.

### If G fails (dedup broken) or G2 fails (cache-buster leaks)
Look at `metadata.sourceUrl` on both rows in IndexedDB.

1. If the two URLs differ by a query param not in `CACHE_BUSTER_KEYS`, decide whether to add it (safe) or normalize elsewhere.
2. If the two URLs differ in path (e.g. `_384_N` vs `_2048_N`), the srcset picker isn't picking the same "widest" entry on both loads — investigate.

### If H fails (new images don't get buttons)
The `MutationObserver` might be missing certain insertion patterns.

1. In `content.ts`, add a temporary `console.log('[MJDW] added:', addedNodes)` inside the observer callback.
2. Trigger MJ pagination and watch what gets logged.
3. If nodes come through but no `<img>` inside, images are inserted separately — expand the observer to also watch `attributes` on existing `<img>` (`src` swap on lazy-load).

### If C2 doesn't populate the error tray
The bg handler isn't writing to `chrome.storage.session`, or the sidepanel isn't listening.

1. `chrome://extensions` → service worker console → `chrome.storage.session.get('captureErrors').then(console.log)`. Should see the error object.
2. Side panel console → confirm `CAPTURE_ERRORS_UPDATED` message arrives (temporary listener log in `ErrorTray.tsx`).

---

## After all checks pass — pick from the mid-tier gap list

Ordered by user value, cheapest first. Do one at a time and commit each.

1. **Narrow `content_scripts` matches** (`manifest.json`). Right now they match all of `midjourney.com/*`, which triggers false layout probes on landing/docs pages. Restrict to the creation surfaces the user actually visits (`/imagine`, `/archive`, `/home`, `/organize`, `/explore`).
2. **Low-res badge on outfit cards**. When `metadata.lowResolution === true`, show a small "low-res" pill in `OutfitList` and a warning in `OutfitDetail`. Prevents surprise at ZIP export time.
3. **Modal draft persistence**. If the user closes the crop-modal tab with regions drawn, work is lost. Either add a `beforeunload` guard when `regions.length > 0`, or autosave drafts to `chrome.storage.session` keyed by stagingId/outfitId and restore on reopen.
4. **Modal keyboard shortcuts**. `Esc` cancels an in-progress drag, `Delete`/`Backspace` removes the last region, `Enter` saves (when the button would be enabled). Big quality-of-life win for heavy cropping.
5. **Rapid-click concurrency cap**. Serialize CDN fetches at ~3 in flight so batch-staging doesn't hammer the MJ CDN or trip a 429.
6. **Export progress**. `ExportBar` blocks with "Zipping…" — add a per-outfit counter (`Zipping outfit 42 / 137`) via a callback on `exportCollectionZip`.
7. **Outfit list search / filter**. SRS promises 500 outfits per collection. Add a name/prompt search box above `OutfitList`.
8. **Wrap CRUD in try/catch in `useAppState`**. Delete/rename errors currently vanish. Route them through the same error tray as capture failures.

---

## Reference — where things live

| Concern | File |
|---|---|
| MJ URL detection, srcset upgrade, metadata extraction | `src/shared/mj-scrape.ts` |
| Content script + button injection + layout probe | `src/content/content.ts` |
| Background handlers (fetch timeout, dedup, layout status, capture errors) | `src/background/service-worker.ts` |
| Message types between contexts | `src/shared/messages.ts` |
| Shared types (`CaptureError`, `MJMetadata`, ...) | `src/shared/types.ts` |
| IndexedDB CRUD | `src/shared/db.ts` |
| Side panel layout banner | `src/sidepanel/components/LayoutBanner.tsx` |
| Side panel capture-error tray | `src/sidepanel/components/ErrorTray.tsx` |
| Side panel staging thumbs | `src/sidepanel/components/StagingArea.tsx` |
| Live refresh listener | `src/sidepanel/hooks/useAppState.ts` |
| Crop modal | `src/modal/App.tsx` |
| ZIP export | `src/shared/zip.ts` + `src/shared/manifest.ts` + `src/sidepanel/components/ExportBar.tsx` |
| Requirements source of truth | `SRS.md` |
