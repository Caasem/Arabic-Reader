import type { SyncTransport } from './transport';

/**
 * The desktop app's preload API (electron/preload.cjs). Absent in a browser and
 * in the mobile apps, where folder sync is not available yet.
 */
export interface SyncFolderBridge {
  /** The chosen folder's path (for display only), or null. */
  get(): Promise<string | null>;
  /** Opens the system folder picker; resolves to the chosen path, or null if cancelled. */
  choose(): Promise<string | null>;
  clear(): Promise<void>;
  list(): Promise<string[]>;
  read(rel: string): Promise<string>;
  write(rel: string, text: string): Promise<void>;
  remove(rel: string): Promise<void>;
}

export interface DesktopBridge {
  syncFolder: SyncFolderBridge;
}

declare global {
  interface Window {
    arabicReaderDesktop?: DesktopBridge;
  }
}

export function getSyncFolderBridge(): SyncFolderBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.syncFolder;
}

/** The folder the user picked, as a sync transport. */
export function createFolderTransport(bridge: SyncFolderBridge): SyncTransport {
  return {
    list: () => bridge.list(),
    read: (path) => bridge.read(path),
    write: (path, text) => bridge.write(path, text),
    remove: (path) => bridge.remove(path),
  };
}
