// Content script for midjourney.com.
// Injects a hover-revealed "+" button on each detected MJ image tile.
// On click, sends the image URL and scraped metadata to the background,
// which fetches full-res, dedupes, and writes to the active collection's
// staging area in IndexedDB.

import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { extractMetadata, findImageTiles, getTileId, isMJImage } from '../shared/mj-scrape';

const BUTTON_MARKER = 'data-mjdw-btn';
const IMG_MARKER = 'data-mjdw-processed';
const HOVER_MARKER = 'data-mjdw-hover-bound';
const stagingByTileId = new Map<string, string>(); // tileId -> stagingId

console.log('[MJ Designer Workflow] content script loaded on', location.href);

function send<T extends ExtensionMessage>(msg: T): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(msg);
}

function styleButton(btn: HTMLButtonElement, state: 'idle' | 'loading' | 'added') {
  const bg = {
    idle: 'rgba(20,20,20,0.85)',
    loading: 'rgba(20,20,20,0.85)',
    added: 'rgba(124,92,255,0.95)',
  }[state];
  btn.style.background = bg;
  btn.textContent = state === 'loading' ? '…' : state === 'added' ? '✓' : '+';
  btn.title = state === 'added' ? 'Remove from staging' : 'Add to staging';
}

function makeButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute(BUTTON_MARKER, '');
  btn.type = 'button';
  Object.assign(btn.style, {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    zIndex: '999999',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 120ms ease',
    fontSize: '16px',
    fontFamily: 'system-ui, sans-serif',
    lineHeight: '26px',
    textAlign: 'center',
    padding: '0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
  });
  return btn;
}

function attachButton(img: HTMLImageElement) {
  if (img.hasAttribute(IMG_MARKER)) return;
  img.setAttribute(IMG_MARKER, '');

  const parent = img.parentElement;
  if (!parent) return;
  const parentPos = getComputedStyle(parent).position;
  if (parentPos === 'static') parent.style.position = 'relative';

  const btn = makeButton();
  const tileId = getTileId(img);
  styleButton(btn, stagingByTileId.has(tileId) ? 'added' : 'idle');

  if (!parent.hasAttribute(HOVER_MARKER)) {
    parent.setAttribute(HOVER_MARKER, '');
    parent.addEventListener('mouseenter', () => {
      parent.querySelectorAll<HTMLButtonElement>(`button[${BUTTON_MARKER}]`).forEach((b) => (b.style.opacity = '1'));
    });
    parent.addEventListener('mouseleave', () => {
      parent.querySelectorAll<HTMLButtonElement>(`button[${BUTTON_MARKER}]`).forEach((b) => (b.style.opacity = '0'));
    });
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onClickButton(btn, img, tileId);
  });

  parent.appendChild(btn);

  // Ask background whether this tile is already staged (for page-reload state).
  send({ type: 'IS_STAGED', tileId }).then((resp) => {
    if (resp.ok && resp.isStaged && resp.stagingId) {
      stagingByTileId.set(tileId, resp.stagingId);
      styleButton(btn, 'added');
    }
  }).catch(() => {});
}

async function onClickButton(btn: HTMLButtonElement, img: HTMLImageElement, tileId: string) {
  const staged = stagingByTileId.get(tileId);
  if (staged) {
    styleButton(btn, 'loading');
    const resp = await send({ type: 'REMOVE_STAGING', stagingId: staged });
    if (resp.ok) {
      stagingByTileId.delete(tileId);
      styleButton(btn, 'idle');
    } else {
      styleButton(btn, 'added');
      console.error('[MJDW] remove failed', resp);
    }
    return;
  }

  styleButton(btn, 'loading');
  const metadata = extractMetadata(img);
  if (!metadata.sourceUrl) {
    styleButton(btn, 'idle');
    console.error('[MJDW] no source URL for image');
    return;
  }
  const rawSrc = img.currentSrc || img.src || null;
  const fallbackUrl = rawSrc && rawSrc !== metadata.sourceUrl ? rawSrc : null;
  let resp: ExtensionResponse | undefined;
  try {
    resp = await send({
      type: 'ADD_STAGING',
      url: metadata.sourceUrl,
      fallbackUrl,
      metadata,
      tileId,
    });
  } catch (err) {
    styleButton(btn, 'idle');
    console.error('[MJDW] add threw', err, 'lastError:', chrome.runtime.lastError);
    return;
  }
  if (!resp) {
    styleButton(btn, 'idle');
    console.error('[MJDW] add got no response — background handler may have crashed. Check service worker console.', 'lastError:', chrome.runtime.lastError);
    return;
  }
  if (resp.ok && resp.stagingId) {
    stagingByTileId.set(tileId, resp.stagingId);
    styleButton(btn, 'added');
  } else {
    styleButton(btn, 'idle');
    console.error('[MJDW] add failed', resp);
  }
}

function scan(root: ParentNode) {
  for (const img of findImageTiles(root)) attachButton(img);
}

scan(document);

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of Array.from(m.addedNodes)) {
      if (!(node instanceof HTMLElement)) continue;
      if (node instanceof HTMLImageElement) {
        if (isMJImage(node)) attachButton(node);
      } else {
        scan(node);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for STAGING_UPDATED (e.g. deletions from side panel) to resync button state.
chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
  if (msg.type !== 'STAGING_UPDATED') return;
  for (const [tileId, stagingId] of stagingByTileId.entries()) {
    send({ type: 'IS_STAGED', tileId }).then((resp) => {
      if (resp.ok && !resp.isStaged) {
        stagingByTileId.delete(tileId);
        document
          .querySelectorAll<HTMLImageElement>(`img[${IMG_MARKER}]`)
          .forEach((img) => {
            if (getTileId(img) === tileId) {
              const parent = img.parentElement;
              const btn = parent?.querySelector<HTMLButtonElement>(`button[${BUTTON_MARKER}]`);
              if (btn) styleButton(btn, 'idle');
            }
          });
      } else if (resp.ok && resp.isStaged && resp.stagingId && resp.stagingId !== stagingId) {
        stagingByTileId.set(tileId, resp.stagingId);
      }
    }).catch(() => {});
  }
});

export {};