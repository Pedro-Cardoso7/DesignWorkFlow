import { getAssetsForOutfit, getBlob, getOutfitsForCollection } from './db';
import { buildManifest, sanitizeName } from './manifest';
import type { Asset, Collection } from './types';

export interface TreeFile {
  path: string;
  blob: Blob;
}

export interface CollectionTree {
  rootFolder: string;
  files: TreeFile[];
}

/**
 * Materialize a collection into its FR-EX-2 file tree — manifest.json plus
 * one folder per outfit containing outfit.png and asset-N.png files.
 * Outfit folder names are disambiguated if sanitization causes collisions.
 */
export async function buildCollectionTree(collection: Collection): Promise<CollectionTree> {
  const outfits = await getOutfitsForCollection(collection.id);
  const assetsByOutfit = new Map<string, Asset[]>();
  for (const outfit of outfits) {
    assetsByOutfit.set(outfit.id, await getAssetsForOutfit(outfit.id));
  }

  const rootFolder = sanitizeName(collection.name);
  const files: TreeFile[] = [];

  const usedFolders = new Set<string>();
  const outfitFolders = new Map<string, string>();
  for (const outfit of outfits) {
    const base = sanitizeName(outfit.name);
    let folder = base;
    let n = 2;
    while (usedFolders.has(folder.toLowerCase())) {
      folder = `${base} (${n++})`;
    }
    usedFolders.add(folder.toLowerCase());
    outfitFolders.set(outfit.id, folder);
  }

  const manifest = buildManifest(
    collection,
    outfits.map((o) => ({ ...o, name: outfitFolders.get(o.id)! })),
    assetsByOutfit,
  );
  files.push({
    path: `${rootFolder}/manifest.json`,
    blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
  });

  for (const outfit of outfits) {
    const folder = outfitFolders.get(outfit.id)!;
    const sourceBlob = await getBlob(outfit.sourceImageBlobId);
    if (sourceBlob) {
      files.push({ path: `${rootFolder}/${folder}/outfit.png`, blob: sourceBlob });
    }
    const assets = assetsByOutfit.get(outfit.id) ?? [];
    for (let i = 0; i < assets.length; i++) {
      const blob = await getBlob(assets[i].blobId);
      if (blob) {
        files.push({ path: `${rootFolder}/${folder}/asset-${i + 1}.png`, blob });
      }
    }
  }

  return { rootFolder, files };
}
