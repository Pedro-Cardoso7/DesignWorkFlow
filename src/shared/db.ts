import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Collection, Outfit, StagingImage } from './types';

export const DB_NAME = 'designworkflow';
export const DB_VERSION = 1;

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