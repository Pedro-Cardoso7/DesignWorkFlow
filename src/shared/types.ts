export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  outfitIds: string[];
}

export interface Outfit {
  id: string;
  collectionId: string;
  name: string;
  createdAt: number;
  sourceImageBlobId: string;
  assetIds: string[];
  metadata: MJMetadata;
}

export interface Asset {
  id: string;
  outfitId: string;
  name: string;
  createdAt: number;
  crop: CropRect;
  blobId: string;
}

export interface StagingImage {
  id: string;
  collectionId: string;
  addedAt: number;
  blobId: string;
  metadata: MJMetadata;
}

export interface MJMetadata {
  prompt: string | null;
  mjTimestamp: number | null;
  mjParams: Record<string, string> | null;
  jobId: string | null;
  sourceUrl: string | null;
  lowResolution: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppState {
  activeCollectionId: string | null;
  syncDirectoryHandleId: string | null;
}