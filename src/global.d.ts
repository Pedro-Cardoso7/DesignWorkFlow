// Ambient declarations for browser APIs not yet in the default TS DOM lib
// used by this project. Replace with `@types/wicg-file-system-access` if
// deeper typing is needed later.

interface FileSystemDirectoryHandle {
  readonly name: string;
  readonly kind: 'directory';
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}