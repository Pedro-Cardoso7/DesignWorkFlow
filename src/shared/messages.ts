import type { CaptureError, MJMetadata } from './types';

export type ExtensionMessage =
  | { type: 'ADD_STAGING'; url: string; fallbackUrl: string | null; metadata: MJMetadata; tileId: string }
  | { type: 'REMOVE_STAGING'; stagingId: string }
  | { type: 'IS_STAGED'; tileId: string }
  | { type: 'STAGING_UPDATED'; collectionId: string }
  | { type: 'OPEN_CROP_MODAL'; stagingId: string }
  | { type: 'OPEN_RECROP_MODAL'; outfitId: string }
  | { type: 'OUTFIT_UPDATED'; outfitId: string }
  | { type: 'LAYOUT_BROKEN'; reason: string }
  | { type: 'LAYOUT_OK' }
  | { type: 'LAYOUT_STATUS_UPDATED'; broken: boolean; reason: string | null }
  | { type: 'GET_LAYOUT_STATUS' }
  | { type: 'DISMISS_LAYOUT_BANNER' }
  | { type: 'CAPTURE_ERRORS_UPDATED'; errors: CaptureError[] }
  | { type: 'GET_CAPTURE_ERRORS' }
  | { type: 'DISMISS_CAPTURE_ERROR'; id: string }
  | { type: 'CLEAR_CAPTURE_ERRORS' };

export type ExtensionResponse =
  | {
      ok: true;
      stagingId?: string;
      alreadyExists?: boolean;
      isStaged?: boolean;
      broken?: boolean;
      reason?: string | null;
      errors?: CaptureError[];
    }
  | { ok: false; error: string };
