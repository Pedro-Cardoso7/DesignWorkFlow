import type { MJMetadata } from './types';

export type ExtensionMessage =
  | { type: 'ADD_STAGING'; url: string; metadata: MJMetadata; tileId: string }
  | { type: 'REMOVE_STAGING'; stagingId: string }
  | { type: 'IS_STAGED'; tileId: string }
  | { type: 'STAGING_UPDATED'; collectionId: string }
  | { type: 'OPEN_CROP_MODAL'; stagingId: string };

export type ExtensionResponse =
  | { ok: true; stagingId?: string; alreadyExists?: boolean; isStaged?: boolean }
  | { ok: false; error: string };
