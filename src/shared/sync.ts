// File System Access API sync — mirrors the IndexedDB state to a user-chosen
// local folder using the ZIP-equivalent structure defined in the SRS.
//
// Full implementation to follow. The public surface here is what the sidepanel
// and background will call.

export interface SyncFolderStatus {
  connected: boolean;
  folderName: string | null;
  lastWriteAt: number | null;
  lastError: string | null;
}

export async function pickSyncFolder(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ mode: 'readwrite' });
}