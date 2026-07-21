import {
  addStagingImage,
  createCollection,
  findStagingBySourceUrl,
  findStagingByTileMarker,
  getActiveCollectionId,
  removeStagingImage,
  setActiveCollectionId,
} from '../shared/db';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';
import { ensurePng } from '../shared/png';
import type { MJMetadata } from '../shared/types';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[bg] setPanelBehavior failed', err));
});

async function ensureActiveCollectionId(): Promise<string> {
  const existing = await getActiveCollectionId();
  if (existing) return existing;
  const created = await createCollection('Untitled collection');
  await setActiveCollectionId(created.id);
  return created.id;
}

interface FetchAttempt {
  ok: true;
  blob: Blob;
  urlUsed: string;
  fellBack: boolean;
}
interface FetchFailure {
  ok: false;
  error: string;
}

async function fetchWithFallback(
  primaryUrl: string,
  fallbackUrl: string | null,
): Promise<FetchAttempt | FetchFailure> {
  const primary = await tryFetch(primaryUrl);
  if (primary.ok) {
    return { ok: true, blob: primary.blob, urlUsed: primaryUrl, fellBack: false };
  }
  if (!fallbackUrl || fallbackUrl === primaryUrl) {
    return { ok: false, error: primary.error };
  }
  const fallback = await tryFetch(fallbackUrl);
  if (fallback.ok) {
    return { ok: true, blob: fallback.blob, urlUsed: fallbackUrl, fellBack: true };
  }
  return {
    ok: false,
    error: `Primary fetch: ${primary.error}. Fallback fetch: ${fallback.error}`,
  };
}

async function tryFetch(url: string): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (err) {
    return { ok: false, error: `threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!resp.ok) {
    return { ok: false, error: `${resp.status} ${resp.statusText}` };
  }
  return { ok: true, blob: await resp.blob() };
}

async function handleAddStaging(
  url: string,
  fallbackUrl: string | null,
  metadata: MJMetadata,
): Promise<ExtensionResponse> {
  const collectionId = await ensureActiveCollectionId();

  const existing = await findStagingBySourceUrl(collectionId, url);
  if (existing) {
    return { ok: true, stagingId: existing.id, alreadyExists: true };
  }

  const fetched = await fetchWithFallback(url, fallbackUrl);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error };
  }

  let pngBlob: Blob;
  try {
    pngBlob = await ensurePng(fetched.blob);
  } catch (err) {
    return {
      ok: false,
      error: `PNG re-encode failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const finalMetadata: MJMetadata = fetched.fellBack
    ? { ...metadata, sourceUrl: fetched.urlUsed, lowResolution: true }
    : metadata;

  const staging = await addStagingImage(collectionId, pngBlob, finalMetadata);

  chrome.runtime
    .sendMessage({ type: 'STAGING_UPDATED', collectionId } satisfies ExtensionMessage)
    .catch(() => {
      // No sidepanel listening — fine.
    });

  return { ok: true, stagingId: staging.id, alreadyExists: false };
}

async function handleRemoveStaging(stagingId: string): Promise<ExtensionResponse> {
  await removeStagingImage(stagingId);
  const collectionId = await getActiveCollectionId();
  if (collectionId) {
    chrome.runtime
      .sendMessage({ type: 'STAGING_UPDATED', collectionId } satisfies ExtensionMessage)
      .catch(() => {});
  }
  return { ok: true };
}

async function handleIsStaged(tileId: string): Promise<ExtensionResponse> {
  const collectionId = await getActiveCollectionId();
  if (!collectionId) return { ok: true, isStaged: false };
  const match = await findStagingByTileMarker(collectionId, tileId);
  return { ok: true, isStaged: !!match, stagingId: match?.id };
}

chrome.runtime.onMessage.addListener((msg: ExtensionMessage, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'ADD_STAGING': {
          sendResponse(await handleAddStaging(msg.url, msg.fallbackUrl, msg.metadata));
          break;
        }
        case 'REMOVE_STAGING': {
          sendResponse(await handleRemoveStaging(msg.stagingId));
          break;
        }
        case 'IS_STAGED': {
          sendResponse(await handleIsStaged(msg.tileId));
          break;
        }
        case 'OPEN_CROP_MODAL': {
          const params = new URLSearchParams({ stagingId: msg.stagingId });
          await chrome.tabs.create({
            url: chrome.runtime.getURL('src/modal/index.html') + '?' + params.toString(),
          });
          sendResponse({ ok: true });
          break;
        }
        case 'OPEN_RECROP_MODAL': {
          const params = new URLSearchParams({ outfitId: msg.outfitId });
          await chrome.tabs.create({
            url: chrome.runtime.getURL('src/modal/index.html') + '?' + params.toString(),
          });
          sendResponse({ ok: true });
          break;
        }
        case 'STAGING_UPDATED':
        case 'OUTFIT_UPDATED':
          // Broadcast notification — not directed to bg, ignore silently.
          return;
        default:
          sendResponse({ ok: false, error: `Unknown message type` });
      }
    } catch (err) {
      console.error('[bg] handler failed', err);
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});

export {};