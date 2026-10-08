import type { BlobFilesBridge } from '../blobStore/fsBackend';
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

/** Window control only the desktop app can do. */
export interface WindowBridge {
  setFullScreen(on: boolean): Promise<void>;
  toggleFullScreen(): Promise<void>;
}

/** An engine the operating system provides (electron/ocrEngines.cjs). */
export interface DesktopOcrEngineInfo {
  id: string;
  name: string;
  description: string;
  /** Language tags the engine can read, e.g. `ar-SA`. */
  languages: string[];
  available: boolean;
  /** Why it cannot be used, or what is missing. */
  reason?: string;
}

export interface DesktopOcrBridge {
  list(): Promise<DesktopOcrEngineInfo[]>;
  recognize(id: string, bytes: Uint8Array, language: string): Promise<unknown>;
  /** Posts a PNG to an address the reader added and returns its JSON answer. */
  http(url: string, bytes: Uint8Array, language: string): Promise<unknown>;
}

export interface DesktopBridge {
  syncFolder: SyncFolderBridge;
  window: WindowBridge;
  /** Text recognition for scanned PDF pages (src/pdf/ocr). */
  ocr?: DesktopOcrBridge;
  /** BlobStore files (src/blobStore/fsBackend.ts). Optional so a page never assumes it. */
  blobs?: BlobFilesBridge;
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
