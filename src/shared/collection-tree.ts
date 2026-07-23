import { getAssetsForOutfit, getBlob, getOutfitsForCollection, getStagingForCollection } from './db';
import { buildManifest, sanitizeName, stagingManifestEntry, type ExportMode, type StagingManifestEntry } from './manifest';
import { deriveOutfitNameFromStaging } from './naming';
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
 * Materialize a collection into its export file tree. Two shapes:
 * - by-outfit (default): <root>/<outfit>/outfit.png + asset-N.png files
 * - by-type: <root>/sources/<outfit>.png (flat) + <type>/<outfit>__<asset>.png
 *   Source folder is `sources/` not `outfits/` to avoid colliding with the `outfit` asset type folder.
 * Both modes include a `staging/` folder with any un-cropped staging images.
 */
export async function buildCollectionTree(
  collection: Collection,
  mode: ExportMode = 'by-outfit',
): Promise<CollectionTree> {
  const outfits = await getOutfitsForCollection(collection.id);
  const assetsByOutfit = new Map<string, Asset[]>();
  for (const outfit of outfits) {
    assetsByOutfit.set(outfit.id, await getAssetsForOutfit(outfit.id));
  }
  const staging = await getStagingForCollection(collection.id);

  const rootFolder = sanitizeName(collection.name);

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

  // Staging file names — dedupe within staging/ folder
  const stagingFileNames = new Map<string, string>();
  const usedStagingNames = new Set<string>();
  for (const s of staging) {
    const base = sanitizeName(deriveOutfitNameFromStaging(s));
    let name = `${base}.png`;
    let n = 2;
    while (usedStagingNames.has(name.toLowerCase())) {
      name = `${base} (${n++}).png`;
    }
    usedStagingNames.add(name.toLowerCase());
    stagingFileNames.set(s.id, name);
  }

  const files: TreeFile[] = [];

  const stagingManifest: StagingManifestEntry[] = staging.map((s) =>
    stagingManifestEntry(`staging/${stagingFileNames.get(s.id)!}`, s.addedAt, s.metadata),
  );

  if (mode === 'by-outfit') {
    const manifest = buildManifest(
      collection,
      outfits.map((o) => ({ ...o, name: outfitFolders.get(o.id)! })),
      assetsByOutfit,
      mode,
      {
        folder: (o) => outfitFolders.get(o.id)!,
        sourceFile: () => 'outfit.png',
        assetFile: (_o, a, i) => `${a.gender ?? 'female'}/asset-${i + 1}.png`,
      },
    );
    manifest.staging = stagingManifest;
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
        const gender = assets[i].gender ?? 'female';
        const blob = await getBlob(assets[i].blobId);
        if (blob) {
          files.push({ path: `${rootFolder}/${folder}/${gender}/asset-${i + 1}.png`, blob });
        }
      }
    }
  } else {
    const assetFileNames = new Map<string, string>();
    const usedByGenderType = new Map<string, Set<string>>();
    for (const outfit of outfits) {
      const outfitFolder = outfitFolders.get(outfit.id)!;
      const assets = assetsByOutfit.get(outfit.id) ?? [];
      for (const asset of assets) {
        const gender = asset.gender ?? 'female';
        const type = asset.type;
        const key = `${gender}/${type}`;
        const used = usedByGenderType.get(key) ?? new Set<string>();
        const base = `${outfitFolder}__${sanitizeName(asset.name)}`;
        let name = `${base}.png`;
        let n = 2;
        while (used.has(name.toLowerCase())) {
          name = `${base} (${n++}).png`;
        }
        used.add(name.toLowerCase());
        usedByGenderType.set(key, used);
        assetFileNames.set(asset.id, `${gender}/${type}/${name}`);
      }
    }

    const manifest = buildManifest(
      collection,
      outfits.map((o) => ({ ...o, name: outfitFolders.get(o.id)! })),
      assetsByOutfit,
      mode,
      {
        folder: () => 'sources',
        sourceFile: (o) => `sources/${outfitFolders.get(o.id)!}.png`,
        assetFile: (_o, a) => assetFileNames.get(a.id) ?? `other/${a.id}.png`,
      },
    );
    manifest.staging = stagingManifest;
    files.push({
      path: `${rootFolder}/manifest.json`,
      blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    });

    for (const outfit of outfits) {
      const folder = outfitFolders.get(outfit.id)!;
      const sourceBlob = await getBlob(outfit.sourceImageBlobId);
      if (sourceBlob) {
        files.push({ path: `${rootFolder}/sources/${folder}.png`, blob: sourceBlob });
      }
      const assets = assetsByOutfit.get(outfit.id) ?? [];
      for (const asset of assets) {
        const rel = assetFileNames.get(asset.id);
        if (!rel) continue;
        const blob = await getBlob(asset.blobId);
        if (blob) files.push({ path: `${rootFolder}/${rel}`, blob });
      }
    }
  }

  // Staging images — same folder in both modes
  for (const s of staging) {
    const name = stagingFileNames.get(s.id);
    if (!name) continue;
    const blob = await getBlob(s.blobId);
    if (blob) files.push({ path: `${rootFolder}/staging/${name}`, blob });
  }

  return { rootFolder, files };
}
