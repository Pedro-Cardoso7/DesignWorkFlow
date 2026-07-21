// Midjourney DOM scraping helpers.
//
// Selectors are intentionally defensive. Image capture must succeed even when
// metadata scraping fails (per SRS FR-MJ-6 / FR-MJ-7).

import type { MJMetadata } from './types';

const MJ_CDN_PATTERNS = [
  /cdn\.midjourney\.com/i,
  /midjourneyusercontent\.com/i,
  /midjourney\.com\/.*\.(png|jpe?g|webp)/i,
];

const UUID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function isMJImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src;
  if (!src) return false;
  if (MJ_CDN_PATTERNS.some((p) => p.test(src))) return true;
  const srcset = img.getAttribute('srcset');
  return !!srcset && MJ_CDN_PATTERNS.some((p) => p.test(srcset));
}

export function findImageTiles(root: ParentNode = document): HTMLImageElement[] {
  return Array.from(root.querySelectorAll('img')).filter(isMJImage);
}

/**
 * Parses an `srcset` string and returns the URL for the widest descriptor.
 * Handles `w` (width) and `x` (density) descriptors. Falls back to the last
 * entry if no descriptors parse.
 */
export function largestFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] ?? '';
      const wMatch = descriptor.match(/^(\d+)w$/);
      const xMatch = descriptor.match(/^([\d.]+)x$/);
      const weight = wMatch
        ? parseInt(wMatch[1], 10)
        : xMatch
          ? parseFloat(xMatch[1]) * 1000 // arbitrary scale; keeps x higher than most w
          : 0;
      return { url, weight };
    });
  if (entries.length === 0) return null;
  entries.sort((a, b) => b.weight - a.weight);
  return entries[0].url;
}

/**
 * Best-effort transform of a thumbnail URL into a full-resolution URL.
 * Strategy: if the element exposes a `srcset`, pick the widest entry from it.
 * Otherwise, rewrite MJ's size hint (e.g. `_384_N.webp` → `_2048_N.webp`).
 * The URL is returned unchanged when no pattern matches — the caller is still
 * responsible for the `lowResolution` flag when the fetch has to fall back.
 */
export function upgradeToFullRes(url: string, srcset: string | null = null): string {
  if (srcset) {
    const largest = largestFromSrcset(srcset);
    if (largest) return stripCacheBuster(largest);
  }
  const rewritten = url
    .replace(/_(\d+)_N\.(webp|png|jpe?g)(\?|$)/i, '_2048_N.$2$3')
    .replace(/\/(?:thumb|small|preview)\//i, '/large/');
  return stripCacheBuster(rewritten);
}

const CACHE_BUSTER_KEYS = new Set(['method', 'qst', 'ts', 't', 'v']);

function stripCacheBuster(url: string): string {
  // MJ sometimes appends known cache-buster query strings that differ between
  // page loads. Strip only those keys so dedup stays stable; keep signature-
  // style params (e.g. `Signature`, `Expires`) intact for CDNs that need them.
  const q = url.indexOf('?');
  if (q === -1) return url;
  const base = url.slice(0, q);
  const params = new URLSearchParams(url.slice(q + 1));
  let mutated = false;
  for (const key of Array.from(params.keys())) {
    if (CACHE_BUSTER_KEYS.has(key)) {
      params.delete(key);
      mutated = true;
    }
  }
  if (!mutated) return url;
  const remaining = params.toString();
  return remaining ? `${base}?${remaining}` : base;
}

export function extractJobIdFromUrl(url: string): string | null {
  const match = url.match(UUID_PATTERN);
  return match?.[1] ?? null;
}

/**
 * Extracts `{jobId}/{row_col}` — unique per tile in a MJ grid.
 * MJ URL shape: https://cdn.midjourney.com/{uuid}/{row}_{col}_{size}_N.{ext}
 * All 4 images in a grid share the UUID but differ by row_col (0_0..0_3).
 */
export function extractTileKey(url: string): string | null {
  const m = url.match(/cdn\.midjourney\.com\/([0-9a-f-]{36})\/(\d+_\d+)_/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Stable per-tile identifier for dedup within a page session and between the
 * content script and background. Prefers the tile key ({jobId}/{row_col}) so
 * grid siblings don't collide. Falls back to the URL (query stripped) so this
 * still returns *something* unique when the pattern doesn't match.
 */
export function getTileId(img: HTMLImageElement): string {
  const src = img.currentSrc || img.src;
  return extractTileKey(src) ?? src.split('?')[0];
}

export function extractMetadata(img: HTMLImageElement): MJMetadata {
  const src = img.currentSrc || img.src;
  const srcset = img.getAttribute('srcset');
  const container = findTileContainer(img);
  const prompt = findPromptText(container);
  const upgraded = upgradeToFullRes(src, srcset);
  const jobId =
    extractJobIdFromUrl(upgraded) ??
    extractJobIdFromUrl(src) ??
    extractJobIdFromContainer(container);
  const mjParams = prompt ? extractParamsFromPrompt(prompt) : null;
  const mjTimestamp = findTimestamp(container);

  return {
    prompt,
    mjTimestamp,
    mjParams,
    jobId,
    sourceUrl: upgraded,
    lowResolution: false,
  };
}

function extractJobIdFromContainer(container: Element | null): string | null {
  if (!container) return null;
  const attrEl = container.closest('[data-job-id], [data-jobid], [data-job]');
  const attr =
    attrEl?.getAttribute('data-job-id') ??
    attrEl?.getAttribute('data-jobid') ??
    attrEl?.getAttribute('data-job');
  if (attr && UUID_PATTERN.test(attr)) return attr.match(UUID_PATTERN)![1];
  const link = container.querySelector('a[href*="jobs/"], a[href*="/job/"]');
  const href = link?.getAttribute('href');
  if (href) {
    const m = href.match(UUID_PATTERN);
    if (m) return m[1];
  }
  return null;
}

function findTileContainer(img: HTMLImageElement): Element | null {
  const explicit = img.closest(
    '[data-job-id], [data-jobid], [data-job], article, figure, [role="listitem"], [role="gridcell"]',
  );
  if (explicit) return explicit;
  let el: HTMLElement | null = img.parentElement;
  for (let i = 0; i < 5 && el; i++) {
    if (el.querySelector('p, [class*="prompt" i], [data-testid*="prompt" i]')) return el;
    el = el.parentElement;
  }
  return img.parentElement;
}

function findPromptText(container: Element | null): string | null {
  if (!container) return null;
  const explicit = container.querySelector(
    '[class*="prompt" i], [data-prompt], [data-testid*="prompt" i], [aria-label*="prompt" i]',
  );
  if (explicit?.textContent) {
    const t = explicit.textContent.trim();
    if (t.length >= 3) return t;
  }
  const candidates = container.querySelectorAll('p, span, div');
  for (const el of Array.from(candidates)) {
    const text = el.textContent?.trim() ?? '';
    if (text.length >= 5 && text.length <= 800 && !/^\d+$/.test(text)) return text;
  }
  return null;
}

function findTimestamp(container: Element | null): number | null {
  if (!container) return null;
  const timeEl = container.querySelector('time[datetime]');
  const iso = timeEl?.getAttribute('datetime');
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

function extractParamsFromPrompt(prompt: string): Record<string, string> | null {
  const matches = prompt.matchAll(/--(\w+)(?:\s+([^\s-]\S*))?/g);
  const params: Record<string, string> = {};
  for (const m of matches) params[m[1]] = m[2] ?? 'true';
  return Object.keys(params).length > 0 ? params : null;
}