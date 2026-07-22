import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { extractTileKey } from './mj-scrape';
import type { Asset, AssetType, Collection, CropRect, MJMetadata, Outfit, StagingImage } from './types';

export const DB_NAME = 'designworkflow';
export const DB_VERSION = 1;

const META_ACTIVE_COLLECTION = 'activeCollectionId';

interface DesignWorkflowDB extends DBSchema {
  collections: { key: string; value: Collection };
  outfits: { key: string; value: Outfit; indexes: { 'by-collection': string } };
  assets: { key: string; value: Asset; indexes: { 'by-outfit': string } };
  staging: { key: string; value: StagingImage; indexes: { 'by-collection': string } };
  blobs: { key: string; value: Blob };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<DesignWorkflowDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<DesignWorkflowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DesignWorkflowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('collections', { keyPath: 'id' });
        db.createObjectStore('outfits', { keyPath: 'id' }).createIndex('by-collection', 'collectionId');
        db.createObjectStore('assets', { keyPath: 'id' }).createIndex('by-outfit', 'outfitId');
        db.createObjectStore('staging', { keyPath: 'id' }).createIndex('by-collection', 'collectionId');
        db.createObjectStore('blobs');
        db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

export async function getAllCollections(): Promise<Collection[]> {
  const db = await getDb();
  const all = await db.getAll('collections');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCollection(id: string): Promise<Collection | undefined> {
  const db = await getDb();
  return db.get('collections', id);
}

export async function createCollection(name: string): Promise<Collection> {
  const db = await getDb();
  const collection: Collection = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled collection',
    createdAt: Date.now(),
    outfitIds: [],
  };
  await db.put('collections', collection);
  return collection;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('collections', id);
  if (!existing) return;
  await db.put('collections', { ...existing, name: name.trim() || existing.name });
}

export async function renameOutfit(id: string, name: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('outfits', id);
  if (!existing) return;
  await db.put('outfits', { ...existing, name: name.trim() || existing.name });
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['collections', 'outfits', 'assets', 'staging', 'blobs'], 'readwrite');

  const outfits = await tx.objectStore('outfits').index('by-collection').getAll(id);
  const staging = await tx.objectStore('staging').index('by-collection').getAll(id);

  const blobIdsToDelete = new Set<string>();
  for (const outfit of outfits) blobIdsToDelete.add(outfit.sourceImageBlobId);
  for (const s of staging) blobIdsToDelete.add(s.blobId);

  for (const outfit of outfits) {
    const assets = await tx.objectStore('assets').index('by-outfit').getAll(outfit.id);
    for (const asset of assets) {
      blobIdsToDelete.add(asset.blobId);
      await tx.objectStore('assets').delete(asset.id);
    }
    await tx.objectStore('outfits').delete(outfit.id);
  }
  for (const s of staging) await tx.objectStore('staging').delete(s.id);
  for (const blobId of blobIdsToDelete) await tx.objectStore('blobs').delete(blobId);
  await tx.objectStore('collections').delete(id);

  await tx.done;
}

export async function getActiveCollectionId(): Promise<string | null> {
  const db = await getDb();
  const value = await db.get('meta', META_ACTIVE_COLLECTION);
  return typeof value === 'string' ? value : null;
}

export async function setActiveCollectionId(id: string | null): Promise<void> {
  const db = await getDb();
  if (id === null) {
    await db.delete('meta', META_ACTIVE_COLLECTION);
  } else {
    await db.put('meta', id, META_ACTIVE_COLLECTION);
  }
}

export async function getStagingForCollection(collectionId: string): Promise<StagingImage[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('staging', 'by-collection', collectionId);
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function getOutfitsForCollection(collectionId: string): Promise<Outfit[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('outfits', 'by-collection', collectionId);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addStagingImage(
  collectionId: string,
  blob: Blob,
  metadata: import('./types').MJMetadata,
): Promise<StagingImage> {
  const db = await getDb();
  const blobId = crypto.randomUUID();
  const staging: StagingImage = {
    id: crypto.randomUUID(),
    collectionId,
    addedAt: Date.now(),
    blobId,
    metadata,
  };
  const tx = db.transaction(['blobs', 'staging'], 'readwrite');
  await tx.objectStore('blobs').put(blob, blobId);
  await tx.objectStore('staging').put(staging);
  await tx.done;
  return staging;
}

export async function removeStagingImage(id: string): Promise<void> {
  const db = await getDb();
  const s = await db.get('staging', id);
  if (!s) return;
  const tx = db.transaction(['staging', 'blobs'], 'readwrite');
  await tx.objectStore('blobs').delete(s.blobId);
  await tx.objectStore('staging').delete(id);
  await tx.done;
}

export async function findStagingBySourceUrl(
  collectionId: string,
  sourceUrl: string,
): Promise<StagingImage | null> {
  const all = await getStagingForCollection(collectionId);
  return all.find((s) => s.metadata.sourceUrl === sourceUrl) ?? null;
}

export async function findStagingByTileMarker(
  collectionId: string,
  tileId: string,
): Promise<StagingImage | null> {
  const all = await getStagingForCollection(collectionId);
  return (
    all.find((s) => {
      const key = s.metadata.sourceUrl ? extractTileKey(s.metadata.sourceUrl) : null;
      return key === tileId || s.metadata.sourceUrl === tileId;
    }) ?? null
  );
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('blobs', id);
}

export async function getStaging(id: string): Promise<StagingImage | undefined> {
  const db = await getDb();
  return db.get('staging', id);
}

function normalizeAsset(a: Asset): Asset {
  return a.type ? a : { ...a, type: 'other' };
}

export async function getAssetsForOutfit(outfitId: string): Promise<Asset[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('assets', 'by-outfit', outfitId);
  return all.sort((a, b) => a.createdAt - b.createdAt).map(normalizeAsset);
}

export interface AssetWithOutfit {
  asset: Asset;
  outfitId: string;
  outfitName: string;
  outfitLowRes: boolean;
}

export async function getAssetsForCollection(collectionId: string): Promise<AssetWithOutfit[]> {
  const outfits = await getOutfitsForCollection(collectionId);
  const results: AssetWithOutfit[] = [];
  for (const outfit of outfits) {
    const assets = await getAssetsForOutfit(outfit.id);
    for (const asset of assets) {
      results.push({
        asset,
        outfitId: outfit.id,
        outfitName: outfit.name,
        outfitLowRes: outfit.metadata.lowResolution,
      });
    }
  }
  return results;
}

export interface ImportAssetInput {
  name: string;
  crop: CropRect;
  blob: Blob;
  type: AssetType;
  createdAt: number;
}

/**
 * Import an outfit with preserved timestamps (used by ZIP import). Unlike
 * createOutfitWithAssets, this preserves manifest-supplied createdAt values.
 */
export async function importOutfit(
  collectionId: string,
  name: string,
  createdAt: number,
  sourceBlob: Blob,
  metadata: MJMetadata,
  assets: ImportAssetInput[],
): Promise<Outfit> {
  const db = await getDb();
  const outfitId = crypto.randomUUID();
  const sourceBlobId = crypto.randomUUID();
  const outfitAssets: Asset[] = assets.map((a) => ({
    id: crypto.randomUUID(),
    outfitId,
    name: a.name.trim() || 'Untitled',
    createdAt: a.createdAt,
    crop: a.crop,
    blobId: crypto.randomUUID(),
    type: a.type,
  }));
  const outfit: Outfit = {
    id: outfitId,
    collectionId,
    name: name.trim() || 'Untitled outfit',
    createdAt,
    sourceImageBlobId: sourceBlobId,
    assetIds: outfitAssets.map((a) => a.id),
    metadata,
  };

  const tx = db.transaction(['blobs', 'outfits', 'assets', 'collections'], 'readwrite');
  await tx.objectStore('blobs').put(sourceBlob, sourceBlobId);
  for (let i = 0; i < outfitAssets.length; i++) {
    await tx.objectStore('blobs').put(assets[i].blob, outfitAssets[i].blobId);
    await tx.objectStore('assets').put(outfitAssets[i]);
  }
  await tx.objectStore('outfits').put(outfit);
  const collection = await tx.objectStore('collections').get(collectionId);
  if (collection) {
    await tx.objectStore('collections').put({
      ...collection,
      outfitIds: [...collection.outfitIds, outfit.id],
    });
  }
  await tx.done;
  return outfit;
}

export async function importStagingImage(
  collectionId: string,
  addedAt: number,
  blob: Blob,
  metadata: MJMetadata,
): Promise<StagingImage> {
  const db = await getDb();
  const blobId = crypto.randomUUID();
  const staging: StagingImage = {
    id: crypto.randomUUID(),
    collectionId,
    addedAt,
    blobId,
    metadata,
  };
  const tx = db.transaction(['blobs', 'staging'], 'readwrite');
  await tx.objectStore('blobs').put(blob, blobId);
  await tx.objectStore('staging').put(staging);
  await tx.done;
  return staging;
}

/**
 * Move an outfit back to staging: duplicate the source blob into a fresh
 * staging entry, then delete the outfit (and its assets). Metadata preserved.
 */
export async function sendOutfitToStaging(outfitId: string): Promise<StagingImage | null> {
  const db = await getDb();
  const outfit = await db.get('outfits', outfitId);
  if (!outfit) return null;
  const sourceBlob = await db.get('blobs', outfit.sourceImageBlobId);
  if (!sourceBlob) return null;
  const staging = await addStagingImage(outfit.collectionId, sourceBlob, outfit.metadata);
  await deleteOutfit(outfitId);
  return staging;
}

export async function updateAssetType(assetId: string, type: AssetType): Promise<void> {
  const db = await getDb();
  const existing = await db.get('assets', assetId);
  if (!existing) return;
  await db.put('assets', { ...existing, type });
}

export async function getOutfit(id: string): Promise<Outfit | undefined> {
  const db = await getDb();
  return db.get('outfits', id);
}

export async function deleteOutfit(outfitId: string): Promise<void> {
  const db = await getDb();
  const outfit = await db.get('outfits', outfitId);
  if (!outfit) return;
  const tx = db.transaction(['collections', 'outfits', 'assets', 'blobs'], 'readwrite');
  const assets = await tx.objectStore('assets').index('by-outfit').getAll(outfitId);
  for (const asset of assets) {
    await tx.objectStore('blobs').delete(asset.blobId);
    await tx.objectStore('assets').delete(asset.id);
  }
  await tx.objectStore('blobs').delete(outfit.sourceImageBlobId);
  await tx.objectStore('outfits').delete(outfitId);
  const collection = await tx.objectStore('collections').get(outfit.collectionId);
  if (collection) {
    await tx.objectStore('collections').put({
      ...collection,
      outfitIds: collection.outfitIds.filter((id) => id !== outfitId),
    });
  }
  await tx.done;
}

export async function deleteAsset(
  assetId: string,
): Promise<{ asset: Asset; blob: Blob } | null> {
  const db = await getDb();
  const asset = await db.get('assets', assetId);
  if (!asset) return null;
  const blob = await db.get('blobs', asset.blobId);
  const tx = db.transaction(['outfits', 'assets', 'blobs'], 'readwrite');
  await tx.objectStore('blobs').delete(asset.blobId);
  await tx.objectStore('assets').delete(assetId);
  const outfit = await tx.objectStore('outfits').get(asset.outfitId);
  if (outfit) {
    await tx.objectStore('outfits').put({
      ...outfit,
      assetIds: outfit.assetIds.filter((id) => id !== assetId),
    });
  }
  await tx.done;
  return blob ? { asset, blob } : null;
}

export async function restoreAsset(asset: Asset, blob: Blob): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['outfits', 'assets', 'blobs'], 'readwrite');
  await tx.objectStore('blobs').put(blob, asset.blobId);
  await tx.objectStore('assets').put(asset);
  const outfit = await tx.objectStore('outfits').get(asset.outfitId);
  if (outfit && !outfit.assetIds.includes(asset.id)) {
    await tx.objectStore('outfits').put({
      ...outfit,
      assetIds: [...outfit.assetIds, asset.id],
    });
  }
  await tx.done;
}

/**
 * Replace an outfit's asset set with a new list of crops (used by the
 * add-assets / re-crop flow per FR-CR-7). All existing assets and their
 * blobs are removed; the source image blob is preserved.
 */
export async function replaceOutfitAssets(
  outfitId: string,
  crops: CropInput[],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['outfits', 'assets', 'blobs'], 'readwrite');
  const outfit = await tx.objectStore('outfits').get(outfitId);
  if (!outfit) {
    await tx.done;
    return;
  }
  const existing = await tx.objectStore('assets').index('by-outfit').getAll(outfitId);
  for (const asset of existing) {
    await tx.objectStore('blobs').delete(asset.blobId);
    await tx.objectStore('assets').delete(asset.id);
  }
  const now = Date.now();
  const newAssets: Asset[] = crops.map((c) => ({
    id: crypto.randomUUID(),
    outfitId,
    name: c.name.trim() || 'Untitled',
    createdAt: now,
    crop: c.crop,
    blobId: crypto.randomUUID(),
    type: c.type ?? 'other',
  }));
  for (let i = 0; i < newAssets.length; i++) {
    await tx.objectStore('blobs').put(crops[i].blob, newAssets[i].blobId);
    await tx.objectStore('assets').put(newAssets[i]);
  }
  await tx.objectStore('outfits').put({
    ...outfit,
    assetIds: newAssets.map((a) => a.id),
  });
  await tx.done;
}

export interface CropInput {
  name: string;
  crop: CropRect;
  blob: Blob;
  type?: AssetType;
}

/**
 * Persist a source image + N crops as a single Outfit with its Assets.
 * Copies the source blob (doesn't reuse the staging blob id), so the outfit
 * survives if the staging entry is later removed.
 */
export async function createOutfitWithAssets(
  collectionId: string,
  name: string,
  sourceBlob: Blob,
  metadata: MJMetadata,
  crops: CropInput[],
): Promise<Outfit> {
  const db = await getDb();
  const outfitId = crypto.randomUUID();
  const sourceBlobId = crypto.randomUUID();
  const assets: Asset[] = crops.map((c) => ({
    id: crypto.randomUUID(),
    outfitId,
    name: c.name.trim() || 'Untitled',
    createdAt: Date.now(),
    crop: c.crop,
    blobId: crypto.randomUUID(),
    type: c.type ?? 'other',
  }));
  const outfit: Outfit = {
    id: outfitId,
    collectionId,
    name: name.trim() || 'Untitled outfit',
    createdAt: Date.now(),
    sourceImageBlobId: sourceBlobId,
    assetIds: assets.map((a) => a.id),
    metadata,
  };

  const tx = db.transaction(['blobs', 'outfits', 'assets', 'collections'], 'readwrite');
  await tx.objectStore('blobs').put(sourceBlob, sourceBlobId);
  for (let i = 0; i < assets.length; i++) {
    await tx.objectStore('blobs').put(crops[i].blob, assets[i].blobId);
    await tx.objectStore('assets').put(assets[i]);
  }
  await tx.objectStore('outfits').put(outfit);
  const collection = await tx.objectStore('collections').get(collectionId);
  if (collection) {
    await tx.objectStore('collections').put({
      ...collection,
      outfitIds: [...collection.outfitIds, outfit.id],
    });
  }
  await tx.done;
  return outfit;
}
