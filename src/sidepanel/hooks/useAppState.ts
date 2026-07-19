import { useCallback, useEffect, useState } from 'react';
import type { Collection, Outfit, StagingImage } from '../../shared/types';
import {
  createCollection as dbCreateCollection,
  deleteCollection as dbDeleteCollection,
  renameCollection as dbRenameCollection,
  getActiveCollectionId,
  getAllCollections,
  getOutfitsForCollection,
  getStagingForCollection,
  setActiveCollectionId,
} from '../../shared/db';

export interface AppStateSnapshot {
  loading: boolean;
  collections: Collection[];
  activeCollection: Collection | null;
  staging: StagingImage[];
  outfits: Outfit[];
}

export interface AppStateActions {
  reload: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameActive: (name: string) => Promise<void>;
  deleteActive: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

export function useAppState(): AppStateSnapshot & AppStateActions {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [staging, setStaging] = useState<StagingImage[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);

  const reload = useCallback(async () => {
    const all = await getAllCollections();
    let active = await getActiveCollectionId();
    if (active && !all.some((c) => c.id === active)) active = null;
    if (!active && all.length > 0) {
      active = all[0].id;
      await setActiveCollectionId(active);
    }
    const [nextStaging, nextOutfits] = active
      ? await Promise.all([getStagingForCollection(active), getOutfitsForCollection(active)])
      : [[], []];
    setCollections(all);
    setActiveId(active);
    setStaging(nextStaging);
    setOutfits(nextOutfits);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeCollection = collections.find((c) => c.id === activeId) ?? null;

  const createCollection = useCallback(
    async (name: string) => {
      const created = await dbCreateCollection(name);
      await setActiveCollectionId(created.id);
      await reload();
    },
    [reload],
  );

  const renameActive = useCallback(
    async (name: string) => {
      if (!activeId) return;
      await dbRenameCollection(activeId, name);
      await reload();
    },
    [activeId, reload],
  );

  const deleteActive = useCallback(async () => {
    if (!activeId) return;
    await dbDeleteCollection(activeId);
    await setActiveCollectionId(null);
    await reload();
  }, [activeId, reload]);

  const setActive = useCallback(
    async (id: string) => {
      await setActiveCollectionId(id);
      await reload();
    },
    [reload],
  );

  return {
    loading,
    collections,
    activeCollection,
    staging,
    outfits,
    reload,
    createCollection,
    renameActive,
    deleteActive,
    setActive,
  };
}