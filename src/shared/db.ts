import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Collection, Outfit, StagingImage } from './types';

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
