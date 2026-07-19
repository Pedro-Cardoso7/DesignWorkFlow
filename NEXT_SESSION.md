# Next Session — Validate MJ Scraping

**Status at end of last session:** milestone 2 shipped (commit `146a46f`). Content script injects hover-`+` on MJ images and pipes them into staging. All scraping heuristics are best-effort first-passes that have never been tested against the real Midjourney DOM.

**Goal for this session:** confirm we're correctly retrieving image URLs, full-resolution assets, and metadata from midjourney.com. Fix what's wrong. Only then move on to milestone 3 (crop modal).

---

## Setup (2 minutes)

1. `npm run dev` in `D:\Projects\DesignWorkFlow` (leaves Vite writing to `dist/` with HMR).
2. `chrome://extensions` → reload the extension.
3. Open `https://www.midjourney.com/home` (or `/archive` / `/imagine`) → open DevTools console.
4. Open the extension side panel and create a fresh test collection ("Scrape test").

---

## Checklist — what to verify

Tick each. If any fail, jump to the corresponding fix section below.

- [ ] **A. Content script loads** — console shows `[MJ Designer Workflow] content script loaded on ...`
- [ ] **B. `+` button appears on every MJ image tile** — hover any generation and confirm the top-right `+` shows up
- [ ] **C. Button click stages the image** — click `+`, watch for `…` → `✓`, thumbnail appears in side panel within ~3s
- [ ] **D. Thumbnail is full-resolution** — right-click the staged thumbnail in the side panel → "Save image", open it, confirm it's high-res (not a 384px or 512px thumbnail)
- [ ] **E. Prompt is captured** — open DevTools Application tab → IndexedDB → `designworkflow` → `staging`. Inspect the row's `metadata.prompt` — should hold the MJ prompt text
- [ ] **F. Job ID is captured** — same row, `metadata.jobId` should be a UUID
- [ ] **G. Dedup works** — click `+` on the same image twice; should stay at one row in staging
- [ ] **H. SPA navigation still works** — scroll/paginate MJ; new images that load should also get `+` buttons (MutationObserver)
- [ ] **I. Remove works round-trip** — hover staged thumb in side panel, click `×`, confirm MJ page button reverts to `+`
- [ ] **J. Reload persistence** — refresh MJ page; images that are still staged should re-show `✓` (via `IS_STAGED` hydration)

---

## Fix sections (by likely failure)

Note: all "files" below are relative to `D:\Projects\DesignWorkFlow\`.

### If B fails (no `+` button on any images)
The CDN regex in `src/shared/mj-scrape.ts` doesn't match MJ's current URLs.

1. On the MJ page, right-click any image → "Inspect". Look at the `<img>` tag's `src` (and `srcset`, `currentSrc`).
2. Copy 2–3 sample URLs. If they don't match `cdn.midjourney.com` or don't end in `.png/.jpg/.webp`, widen `MJ_CDN_PATTERNS` in `mj-scrape.ts`.
3. Also check: are the images inside a `<picture>` element? Are they set as CSS `background-image` instead of `<img>`? If it's `background-image`, the whole detection strategy needs to switch from `querySelectorAll('img')` to walking elements and reading `getComputedStyle(el).backgroundImage`.

### If B fails only on some tiles (partial)
Some layouts might use `<div style="background-image: url(...)">` instead of `<img>`. Add a background-image scanner to `findImageTiles`.

### If C fails (click doesn't stage)
Open DevTools console when clicking. Look for:
- `[MJDW] add failed` with a fetch error → the full-res URL is bogus (see D below).
- CORS error → add MJ's CDN host to `host_permissions` in `manifest.json` (already includes `midjourney.com/*` and `www.midjourney.com/*` — may need `cdn.midjourney.com/*`).
- No error at all → check background service worker DevTools: `chrome://extensions` → find the extension → "Inspect views: service worker".

### If D fails (thumbnail is low-res)
`upgradeToFullRes()` in `mj-scrape.ts` guessed the wrong URL pattern.

1. On the MJ page, inspect an `<img>` and copy its `srcset`. It usually looks like `url_384.webp 384w, url_768.webp 768w, url_2048.webp 2048w`.
2. Note the exact pattern MJ uses (the number segment, the file extension, whether there's a `_N` suffix).
3. Rewrite `upgradeToFullRes` to pick the largest srcset entry, or transform the src to match the largest size.
4. Alternative: find the "download original" link/button MJ exposes on job detail views and scrape that URL when available.

### If E fails (no prompt captured)
`findPromptText()` in `mj-scrape.ts` walked the DOM but didn't find prompt text.

1. Inspect an image tile in DevTools. Walk up 3–5 ancestors and look for the element containing the prompt string.
2. Note that element's class name, `data-*` attributes, or role.
3. Add a targeted selector as the first check in `findPromptText` before the generic p/span/div walk.

### If F fails (no job ID)
Job ID extraction relies on a UUID in the image URL (`extractJobIdFromUrl`).

1. Check if MJ URLs include a UUID. If not, look at the surrounding DOM — job IDs are often in `data-*` attributes on containers, or in the URL of the "view details" link.
2. Update `extractJobIdFromUrl` or add container-attribute extraction in `extractMetadata`.

### If G fails (dedup broken)
Check what's stored as `metadata.sourceUrl` for the two rows in IndexedDB. If they differ (e.g. one has a query string, one doesn't), normalize the URL in `upgradeToFullRes` (strip query strings).

### If H fails (new images don't get buttons)
The `MutationObserver` might be missing certain insertion patterns.

1. In content.ts, add a temporary `console.log('[MJDW] added:', addedNodes)` inside the observer callback.
2. Trigger MJ pagination and watch what gets logged.
3. If nodes come through but no `<img>` inside, the images are inserted separately — expand the observer to also watch attribute changes on existing `<img>` elements.

---

## What to do after all checks pass

1. Commit any scrape fixes as `Fix MJ scraping: <specifics>`.
2. Move to **milestone 3: crop modal**:
   - Open modal via `chrome.tabs.create` with `?stagingId=...`
   - Multi-region rectangle drawing on a canvas
   - "Save all" → create outfit, crop assets from source
3. Then milestone 4 (FS Access sync + ZIP export) and milestone 5 (CRUD polish + defensive banners).

---

## Reference — where things live

| Concern | File |
|---|---|
| MJ URL detection, metadata extraction | `src/shared/mj-scrape.ts` |
| Content script + button injection | `src/content/content.ts` |
| Background handlers (fetch, dedup, IS_STAGED) | `src/background/service-worker.ts` |
| Message types between contexts | `src/shared/messages.ts` |
| IndexedDB CRUD | `src/shared/db.ts` |
| Side panel staging thumbs | `src/sidepanel/components/StagingArea.tsx` |
| Live refresh listener | `src/sidepanel/hooks/useAppState.ts` |
| Requirements source of truth | `SRS.md` |
