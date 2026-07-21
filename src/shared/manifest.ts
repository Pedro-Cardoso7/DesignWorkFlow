import type { Asset, Collection, Outfit } from './types';

export interface AssetManifestEntry {
  name: string;
  file: string;
  crop: { x: number; y: number; width: number; height: number };
  createdAt: number;
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

export interface CollectionManifest {
  collectionName: string;
  createdAt: number;
  generatedAt: number;
  outfits: OutfitManifestEntry[];
}

export function buildManifest(
  collection: Collection,
  outfits: Outfit[],
  assetsByOutfit: Map<string, Asset[]>,
): CollectionManifest {
  const outfitEntries: OutfitManifestEntry[] = outfits.map((outfit) => {
    const assets = assetsByOutfit.get(outfit.id) ?? [];
    const folder = sanitizeName(outfit.name);
    return {
      name: outfit.name,
      folder,
      sourceFile: 'outfit.png',
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
        file: `asset-${i + 1}.png`,
        crop: asset.crop,
        createdAt: asset.createdAt,
      })),
    };
  });

  return {
    collectionName: collection.name,
    createdAt: collection.createdAt,
    generatedAt: Date.now(),
    outfits: outfitEntries,
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
