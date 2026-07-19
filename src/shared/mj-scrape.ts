// Midjourney DOM scraping helpers.
//
// The content script uses these to identify image tiles, extract
// full-resolution URLs, and pull adjacent metadata (prompt, params, job ID,
// timestamp). Selectors are intentionally defensive — MJ's UI changes and
// these helpers must fail loudly on image capture and silently on metadata.
//
// Full implementation to follow.

import type { MJMetadata } from './types';

export function findImageTiles(_root: ParentNode = document): HTMLElement[] {
  return [];
}

export function extractMetadata(_tile: HTMLElement): MJMetadata {
  return {
    prompt: null,
    mjTimestamp: null,
    mjParams: null,
    jobId: null,
    sourceUrl: null,
    lowResolution: false,
  };
}