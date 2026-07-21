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
import type { CaptureError, MJMetadata } from '../shared/types';

const FETCH_TIMEOUT_MS = 8000;
const CAPTURE_ERRORS_KEY = 'captureErrors';
const CAPTURE_ERRORS_MAX = 20;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: `timeout after ${FETCH_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: `threw: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
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
    await recordCaptureError(url, fetched.error);
    return { ok: false, error: fetched.error };
  }

  let pngBlob: Blob;
  try {
    pngBlob = await ensurePng(fetched.blob);
  } catch (err) {
    const msg = `PNG re-encode failed: ${err instanceof Error ? err.message : String(err)}`;
    await recordCaptureError(url, msg);
    return { ok: false, error: msg };
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

const LAYOUT_STATUS_KEY = 'layoutStatus';
interface LayoutStatus {
  broken: boolean;
  reason: string | null;
  dismissed: boolean;
}

async function getLayoutStatus(): Promise<LayoutStatus> {
  const stored = await chrome.storage.session.get(LAYOUT_STATUS_KEY);
  const status = stored[LAYOUT_STATUS_KEY] as LayoutStatus | undefined;
  return status ?? { broken: false, reason: null, dismissed: false };
}

async function setLayoutStatus(status: LayoutStatus): Promise<void> {
  await chrome.storage.session.set({ [LAYOUT_STATUS_KEY]: status });
  chrome.runtime
    .sendMessage({
      type: 'LAYOUT_STATUS_UPDATED',
      broken: status.broken && !status.dismissed,
      reason: status.reason,
    } satisfies ExtensionMessage)
    .catch(() => {});
}

async function handleLayoutBroken(reason: string): Promise<ExtensionResponse> {
  const current = await getLayoutStatus();
  // Preserve dismissed state only if the reason hasn't changed.
  const dismissed = current.broken && current.reason === reason ? current.dismissed : false;
  await setLayoutStatus({ broken: true, reason, dismissed });
  return { ok: true };
}

async function handleLayoutOk(): Promise<ExtensionResponse> {
  const current = await getLayoutStatus();
  if (!current.broken) return { ok: true };
  await setLayoutStatus({ broken: false, reason: null, dismissed: false });
  return { ok: true };
}

async function handleGetLayoutStatus(): Promise<ExtensionResponse> {
  const s = await getLayoutStatus();
  return { ok: true, broken: s.broken && !s.dismissed, reason: s.reason };
}

async function handleDismissLayoutBanner(): Promise<ExtensionResponse> {
  const current = await getLayoutStatus();
  if (!current.broken) return { ok: true };
  await setLayoutStatus({ ...current, dismissed: true });
  return { ok: true };
}

async function getCaptureErrors(): Promise<CaptureError[]> {
  const stored = await chrome.storage.session.get(CAPTURE_ERRORS_KEY);
  const list = stored[CAPTURE_ERRORS_KEY] as CaptureError[] | undefined;
  return list ?? [];
}

async function saveCaptureErrors(errors: CaptureError[]): Promise<void> {
  await chrome.storage.session.set({ [CAPTURE_ERRORS_KEY]: errors });
  chrome.runtime
    .sendMessage({ type: 'CAPTURE_ERRORS_UPDATED', errors } satisfies ExtensionMessage)
    .catch(() => {});
}

async function recordCaptureError(url: string | null, error: string): Promise<void> {
  const current = await getCaptureErrors();
  const entry: CaptureError = {
    id: crypto.randomUUID(),
    url,
    error,
    at: Date.now(),
  };
  const next = [entry, ...current].slice(0, CAPTURE_ERRORS_MAX);
  await saveCaptureErrors(next);
}

async function handleGetCaptureErrors(): Promise<ExtensionResponse> {
  return { ok: true, errors: await getCaptureErrors() };
}

async function handleDismissCaptureError(id: string): Promise<ExtensionResponse> {
  const current = await getCaptureErrors();
  const next = current.filter((e) => e.id !== id);
  if (next.length !== current.length) await saveCaptureErrors(next);
  return { ok: true };
}

async function handleClearCaptureErrors(): Promise<ExtensionResponse> {
  await saveCaptureErrors([]);
  return { ok: true };
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
        case 'LAYOUT_BROKEN': {
          sendResponse(await handleLayoutBroken(msg.reason));
          break;
        }
        case 'LAYOUT_OK': {
          sendResponse(await handleLayoutOk());
          break;
        }
        case 'GET_LAYOUT_STATUS': {
          sendResponse(await handleGetLayoutStatus());
          break;
        }
        case 'DISMISS_LAYOUT_BANNER': {
          sendResponse(await handleDismissLayoutBanner());
          break;
        }
        case 'GET_CAPTURE_ERRORS': {
          sendResponse(await handleGetCaptureErrors());
          break;
        }
        case 'DISMISS_CAPTURE_ERROR': {
          sendResponse(await handleDismissCaptureError(msg.id));
          break;
        }
        case 'CLEAR_CAPTURE_ERRORS': {
          sendResponse(await handleClearCaptureErrors());
          break;
        }
        case 'STAGING_UPDATED':
        case 'OUTFIT_UPDATED':
        case 'LAYOUT_STATUS_UPDATED':
        case 'CAPTURE_ERRORS_UPDATED':
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