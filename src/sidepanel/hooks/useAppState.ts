import { useCallback, useEffect, useState } from 'react';
import type { Collection, Outfit, StagingImage } from '../../shared/types';
import type { ExtensionMessage } from '../../shared/messages';
import {
  createCollection as dbCreateCollection,
  deleteAsset as dbDeleteAsset,
  deleteCollection as dbDeleteCollection,
  deleteOutfit as dbDeleteOutfit,
  renameCollection as dbRenameCollection,
  renameOutfit as dbRenameOutfit,
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
  selectedOutfitId: string | null;
  outfitRefreshKey: number;
}

export interface AppStateActions {
  reload: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameActive: (name: string) => Promise<void>;
  deleteActive: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  selectOutfit: (id: string | null) => void;
  deleteOutfit: (id: string) => Promise<void>;
  renameOutfit: (id: string, name: string) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
}

export function useAppState(): AppStateSnapshot & AppStateActions {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [staging, setStaging] = useState<StagingImage[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [outfitRefreshKey, setOutfitRefreshKey] = useState(0);

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

  useEffect(() => {
    const listener = (msg: ExtensionMessage) => {
      if (msg.type === 'STAGING_UPDATED') {
        reload();
      } else if (msg.type === 'OUTFIT_UPDATED') {
        reload();
        setOutfitRefreshKey((k) => k + 1);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [reload]);

  const activeCollection = collections.find((c) => c.id === activeId) ?? null;

  const createCollection = useCallback(
    async (name: string) => {
      const created = await dbCreateCollection(name);
      await setActiveCollectionId(created.id);
      setSelectedOutfitId(null);
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
    setSelectedOutfitId(null);
    await reload();
  }, [activeId, reload]);

  const setActive = useCallback(
    async (id: string) => {
      await setActiveCollectionId(id);
      setSelectedOutfitId(null);
      await reload();
    },
    [reload],
  );

  const selectOutfit = useCallback((id: string | null) => {
    setSelectedOutfitId(id);
  }, []);

  const deleteOutfit = useCallback(
    async (id: string) => {
      await dbDeleteOutfit(id);
      if (selectedOutfitId === id) setSelectedOutfitId(null);
      await reload();
    },
    [reload, selectedOutfitId],
  );

  const renameOutfit = useCallback(
    async (id: string, name: string) => {
      await dbRenameOutfit(id, name);
      await reload();
    },
    [reload],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await dbDeleteAsset(id);
      setOutfitRefreshKey((k) => k + 1);
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
    selectedOutfitId,
    outfitRefreshKey,
    reload,
    createCollection,
    renameActive,
    deleteActive,
    setActive,
    selectOutfit,
    deleteOutfit,
    renameOutfit,
    deleteAsset,
  };
}
