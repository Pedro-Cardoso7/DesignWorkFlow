import type { Asset, AssetType, Collection, Gender, MJMetadata, Outfit } from './types';

export interface AssetManifestEntry {
  name: string;
  file: string;
  crop: { x: number; y: number; width: number; height: number };
  createdAt: number;
  type: AssetType;
  gender: Gender;
}

export interface OutfitManifestEntry {
  name: string;
  folder: string;
  sourceFile: string;
  createdAt: number;
  updatedAt: number;
  prompt: string | null;
  mjTimestamp: number | null;
  mjParams: Record<string, string> | null;
  jobId: string | null;
  sourceUrl: string | null;
  lowResolution: boolean;
  assets: AssetManifestEntry[];
}

export type ExportMode = 'by-outfit' | 'by-type';

export interface StagingManifestEntry {
  file: string;
  addedAt: number;
  prompt: string | null;
  mjTimestamp: number | null;
  mjParams: Record<string, string> | null;
  jobId: string | null;
  sourceUrl: string | null;
  lowResolution: boolean;
}

export interface CollectionManifest {
  collectionName: string;
  createdAt: number;
  generatedAt: number;
  mode: ExportMode;
  outfits: OutfitManifestEntry[];
  staging: StagingManifestEntry[];
}

export function stagingManifestEntry(file: string, addedAt: number, meta: MJMetadata): StagingManifestEntry {
  return {
    file,
    addedAt,
    prompt: meta.prompt,
    mjTimestamp: meta.mjTimestamp,
    mjParams: meta.mjParams,
    jobId: meta.jobId,
    sourceUrl: meta.sourceUrl,
    lowResolution: meta.lowResolution,
  };
}

export interface ManifestPaths {
  folder: (outfit: Outfit) => string;
  sourceFile: (outfit: Outfit) => string;
  assetFile: (outfit: Outfit, asset: Asset, index: number) => string;
}

export function buildManifest(
  collection: Collection,
  outfits: Outfit[],
  assetsByOutfit: Map<string, Asset[]>,
  mode: ExportMode,
  paths: ManifestPaths,
): CollectionManifest {
  const outfitEntries: OutfitManifestEntry[] = outfits.map((outfit) => {
    const assets = assetsByOutfit.get(outfit.id) ?? [];
    return {
      name: outfit.name,
      folder: paths.folder(outfit),
      sourceFile: paths.sourceFile(outfit),
      createdAt: outfit.createdAt,
      updatedAt: Math.max(outfit.createdAt, ...assets.map((a) => a.createdAt)),
      prompt: outfit.metadata.prompt,
      mjTimestamp: outfit.metadata.mjTimestamp,
      mjParams: outfit.metadata.mjParams,
      jobId: outfit.metadata.jobId,
      sourceUrl: outfit.metadata.sourceUrl,
      lowResolution: outfit.metadata.lowResolution,
      assets: assets.map((asset, i) => ({
        name: asset.name,
        file: paths.assetFile(outfit, asset, i),
        crop: asset.crop,
        createdAt: asset.createdAt,
        type: asset.type,
        gender: asset.gender ?? 'female',
      })),
    };
  });

  return {
    collectionName: collection.name,
    createdAt: collection.createdAt,
    generatedAt: Date.now(),
    mode,
    outfits: outfitEntries,
    staging: [],
  };
}

// Strip characters illegal on Windows/macOS/Linux, collapse whitespace, trim.
// Reserved Windows names (CON, PRN, NUL, ...) are prefixed to avoid collision.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim();
  const safe = cleaned || 'Untitled';
  if (RESERVED.test(safe)) return `_${safe}`;
  return safe;
}
