import type { MJMetadata } from './types';

export type ExtensionMessage =
  | { type: 'ADD_STAGING'; url: string; metadata: MJMetadata; tileId: string }
  | { type: 'REMOVE_STAGING'; stagingId: string }
  | { type: 'IS_STAGED'; tileId: string }
  | { type: 'STAGING_UPDATED'; collectionId: string }
  | { type: 'OPEN_CROP_MODAL'; stagingId: string }
  | { type: 'OPEN_RECROP_MODAL'; outfitId: string }
  | { type: 'OUTFIT_UPDATED'; outfitId: string };

export type ExtensionResponse =
  | { ok: true; stagingId?: string; alreadyExists?: boolean; isStaged?: boolean }
  | { ok: false; error: string };
