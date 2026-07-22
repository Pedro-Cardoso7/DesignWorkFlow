import JSZip from 'jszip';
import {
  createCollection,
  importOutfit,
  importStagingImage,
  type ImportAssetInput,
} from './db';
import type { CollectionManifest } from './manifest';
import type { MJMetadata } from './types';
import { ASSET_TYPES } from './types';

export interface ImportResult {
  collectionId: string;
  collectionName: string;
  outfitsImported: number;
  stagingImported: number;
  warnings: string[];
}

/**
 * Restore a collection from a ZIP produced by exportCollectionZip. Always
 * creates a new collection (never merges); the imported name may collide
 * with existing ones — that's allowed.
 */
export async function importCollectionZip(zipBlob: Blob): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(zipBlob);

  const manifestEntry = findManifestEntry(zip);
  if (!manifestEntry) throw new Error('manifest.json not found in ZIP');

  const rootPrefix = manifestEntry.name.slice(0, manifestEntry.name.length - 'manifest.json'.length);
  const manifestJson = await manifestEntry.async('string');
  let manifest: CollectionManifest;
  try {
    manifest = JSON.parse(manifestJson) as CollectionManifest;
  } catch (err) {
    throw new Error(`manifest.json is not valid JSON: ${(err as Error).message}`);
  }

  const warnings: string[] = [];
  const collection = await createCollection(manifest.collectionName || 'Imported collection');

  let outfitsImported = 0;
  for (const entry of manifest.outfits ?? []) {
    try {
      const sourcePath = joinManifestPath(rootPrefix, entry.folder, entry.sourceFile);
      const sourceBlob = await readBlob(zip, sourcePath);
      if (!sourceBlob) {
        warnings.push(`Skipped outfit "${entry.name}": source file missing (${sourcePath})`);
        continue;
      }
      const assetInputs: ImportAssetInput[] = [];
      for (const a of entry.assets ?? []) {
        const assetPath = joinManifestPath(rootPrefix, entry.folder, a.file);
        const assetBlob = await readBlob(zip, assetPath);
        if (!assetBlob) {
          warnings.push(`Skipped asset "${a.name}" in outfit "${entry.name}": file missing (${assetPath})`);
          continue;
        }
        assetInputs.push({
          name: a.name,
          crop: a.crop,
          blob: assetBlob,
          type: coerceType(a.type),
          createdAt: a.createdAt || Date.now(),
        });
      }
      const metadata: MJMetadata = {
        prompt: entry.prompt,
        mjTimestamp: entry.mjTimestamp,
        mjParams: entry.mjParams,
        jobId: entry.jobId,
        sourceUrl: entry.sourceUrl,
        lowResolution: entry.lowResolution,
      };
      await importOutfit(
        collection.id,
        entry.name,
        entry.createdAt || Date.now(),
        sourceBlob,
        metadata,
        assetInputs,
      );
      outfitsImported++;
    } catch (err) {
      warnings.push(`Failed to import outfit "${entry.name}": ${(err as Error).message}`);
    }
  }

  let stagingImported = 0;
  for (const entry of manifest.staging ?? []) {
    try {
      const path = joinManifestPath(rootPrefix, '', entry.file);
      const blob = await readBlob(zip, path);
      if (!blob) {
        warnings.push(`Skipped staging file: missing (${path})`);
        continue;
      }
      const metadata: MJMetadata = {
        prompt: entry.prompt,
        mjTimestamp: entry.mjTimestamp,
        mjParams: entry.mjParams,
        jobId: entry.jobId,
        sourceUrl: entry.sourceUrl,
        lowResolution: entry.lowResolution,
      };
      await importStagingImage(collection.id, entry.addedAt || Date.now(), blob, metadata);
      stagingImported++;
    } catch (err) {
      warnings.push(`Failed to import staging entry: ${(err as Error).message}`);
    }
  }

  return {
    collectionId: collection.id,
    collectionName: collection.name,
    outfitsImported,
    stagingImported,
    warnings,
  };
}

function findManifestEntry(zip: JSZip): JSZip.JSZipObject | null {
  // Prefer a top-level "<root>/manifest.json"; fall back to any manifest.json.
  const candidates: JSZip.JSZipObject[] = [];
  zip.forEach((_path, obj) => {
    if (!obj.dir && obj.name.endsWith('manifest.json')) candidates.push(obj);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  return candidates[0];
}

function joinManifestPath(rootPrefix: string, folder: string, file: string): string {
  // If `file` already contains a slash, treat it as root-relative (by-type manifests
  // and staging entries use full paths). Otherwise combine with the outfit folder.
  if (file.includes('/')) return `${rootPrefix}${file}`;
  const cleanFolder = folder ? folder.replace(/\/$/, '') + '/' : '';
  return `${rootPrefix}${cleanFolder}${file}`;
}

async function readBlob(zip: JSZip, path: string): Promise<Blob | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.async('blob');
}

function coerceType(t: unknown): ImportAssetInput['type'] {
  return typeof t === 'string' && (ASSET_TYPES as readonly string[]).includes(t)
    ? (t as ImportAssetInput['type'])
    : 'other';
}
