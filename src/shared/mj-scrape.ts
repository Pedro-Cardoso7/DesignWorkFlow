// Midjourney DOM scraping helpers.
//
// Selectors are intentionally defensive. Image capture must succeed even when
// metadata scraping fails (per SRS FR-MJ-6 / FR-MJ-7).

import type { MJMetadata } from './types';

const MJ_CDN_PATTERNS = [
  /cdn\.midjourney\.com/i,
  /midjourney\.com\/.*\.(png|jpe?g|webp)/i,
];

const UUID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function isMJImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src;
  if (!src) return false;
  return MJ_CDN_PATTERNS.some((p) => p.test(src));
}

export function findImageTiles(root: ParentNode = document): HTMLImageElement[] {
  return Array.from(root.querySelectorAll('img')).filter(isMJImage);
}

/**
 * Best-effort transform of a thumbnail URL into a full-resolution URL.
 * MJ commonly serves images with size hints in the path (e.g. `_384_N.webp`,
 * `_512_N.webp`). We rewrite these to a larger size and fall back to the
 * original URL if it doesn't match a known pattern.
 */
export function upgradeToFullRes(url: string): string {
  return url
    .replace(/_(\d+)_N\.(webp|png|jpe?g)(\?|$)/i, '_2048_N.$2$3')
    .replace(/\/(?:thumb|small|preview)\//i, '/large/');
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
  const container = findTileContainer(img);
  const prompt = findPromptText(container);
  const jobId = extractJobIdFromUrl(src);
  const mjParams = prompt ? extractParamsFromPrompt(prompt) : null;
  const mjTimestamp = findTimestamp(container);

  return {
    prompt,
    mjTimestamp,
    mjParams,
    jobId,
    sourceUrl: upgradeToFullRes(src),
    lowResolution: false,
  };
}

function findTileContainer(img: HTMLImageElement): Element | null {
  const explicit = img.closest('[data-job-id], article, figure, [role="listitem"], [role="gridcell"]');
  if (explicit) return explicit;
  let el: HTMLElement | null = img.parentElement;
  for (let i = 0; i < 5 && el; i++) {
    if (el.querySelector('p, [class*="prompt" i]')) return el;
    el = el.parentElement;
  }
  return img.parentElement;
}

function findPromptText(container: Element | null): string | null {
  if (!container) return null;
  const explicit = container.querySelector('[class*="prompt" i], [data-prompt]');
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
  const matches = prompt.matchAll(/--(\w+)(?:\s+([^\s-][^\s]*))?/g);
  const params: Record<string, string> = {};
  for (const m of matches) params[m[1]] = m[2] ?? 'true';
  return Object.keys(params).length > 0 ? params : null;
}