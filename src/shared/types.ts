export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  outfitIds: string[];
}

export interface Outfit {
  id: string;
  collectionId: string;
  name: string;
  createdAt: number;
  sourceImageBlobId: string;
  assetIds: string[];
  metadata: MJMetadata;
}

export const ASSET_TYPES = [
  'outfit',
  'head',
  'makeup',
  'torso',
  'pants',
  'shoes',
  'accessories',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export type Gender = 'female' | 'male' | 'unisex';
export const GENDERS: Gender[] = ['female', 'male', 'unisex'];

export interface Asset {
  id: string;
  outfitId: string;
  name: string;
  createdAt: number;
  crop: CropRect;
  blobId: string;
  type: AssetType;
  gender: Gender;
}

export function inferAssetTypeFromName(name: string): AssetType {
  const n = name.trim().toLowerCase();
  if (n.startsWith('head')) return 'head';
  if (n.startsWith('makeup') || n.startsWith('make-up') || n.startsWith('make up')) return 'makeup';
  if (n.startsWith('top') || n.startsWith('torso') || n.startsWith('shirt') || n.startsWith('jacket')) return 'torso';
  if (n.startsWith('bottom') || n.startsWith('pants') || n.startsWith('skirt') || n.startsWith('trousers')) return 'pants';
  if (n.startsWith('shoe') || n.startsWith('boot') || n.startsWith('footwear')) return 'shoes';
  if (n.startsWith('accessor') || n.startsWith('bag') || n.startsWith('hat') || n.startsWith('belt') || n.startsWith('jewel')) return 'accessories';
  if (n.startsWith('outfit') || n.startsWith('full') || n === 'body') return 'outfit';
  return 'other';
}

export interface StagingImage {
  id: string;
  collectionId: string;
  addedAt: number;
  blobId: string;
  metadata: MJMetadata;
}

export interface MJMetadata {
  prompt: string | null;
  mjTimestamp: number | null;
  mjParams: Record<string, string> | null;
  jobId: string | null;
  sourceUrl: string | null;
  lowResolution: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppState {
  activeCollectionId: string | null;
}

export interface CaptureError {
  id: string;
  url: string | null;
  error: string;
  at: number;
}