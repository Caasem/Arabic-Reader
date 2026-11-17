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

/** What the main process knows of a file opened in place (electron/diskFiles.cjs). */
export interface DiskFileInfo {
  name: string;
  size: number;
  /** Modified time in whole milliseconds. */
  mtime: number;
  /** SHA-256 of the bytes, hex. */
  hash: string;
  /** Lower case, without the dot. */
  ext: string;
}

/** Files opened in place. A file is named by an opaque token for this run, or by its hash; never by a path. */
export interface DesktopFilesBridge {
  describe(token: string): Promise<DiskFileInfo>;
  read(token: string): Promise<Uint8Array>;
  /** The bytes of the file last seen with this hash, or null when it is gone or changed. */
  readByHash(hash: string): Promise<Uint8Array | null>;
  /** Opens the system dialog and each chosen book in a light window. Resolves to how many were chosen. */
  open(): Promise<number>;
  /** Opens the dialog; accepts only a file with this hash. */
  locate(hash: string): Promise<'found' | 'different' | 'cancelled'>;
  /** True when the recorded file is still there, unchanged. */
  has(hash: string): Promise<boolean>;
  /** Tokens of files the OS handed over that need the ordinary import (MOBI, AZW3, TXT, Markdown). */
  takeImports(): Promise<string[]>;
  /** Every file opened or added so far, as { path, hash }. */
  known(): Promise<{ path: string; hash: string }[]>;
  onImports(cb: () => void): () => void;
}

/** A book file the scan found (electron/bookScan.cjs). */
export interface ScanResult {
  path: string;
  name: string;
  /** Lower case, without the dot: pdf, epub, mobi, azw3, txt or md. */
  format: string;
  size: number;
  /** Modified time in whole milliseconds. */
  mtime: number;
}

export interface ScanState {
  /** The places the last scan looked in. */
  roots: string[];
  /** The folders the reader added. */
  extraFolders: string[];
  results: ScanResult[];
  scannedAt: number | null;
  running: boolean;
}

export interface ScanProgress {
  checked: number;
  found: number;
  done: boolean;
  /** The books found since the last progress message. */
  added: ScanResult[];
}

/** Finding books on this computer. Paths are for showing and for asking back; the main process refuses any the scan did not find. */
export interface DesktopScanBridge {
  start(extra?: string[]): Promise<{ checked: number; found: number; cancelled: boolean }>;
  stop(): Promise<void>;
  results(): Promise<ScanState>;
  onProgress(cb: (progress: ScanProgress) => void): () => void;
  addFolder(): Promise<string[]>;
  removeFolder(folder: string): Promise<string[]>;
  openResult(path: string): Promise<void>;
  readResult(path: string): Promise<Uint8Array>;
}

/** One open window, as the main process lists them. */
export interface DesktopWindowInfo {
  id: number;
  /** The main window (Library and the rest) or a light window (the reader alone). */
  kind: 'main' | 'light';
  bookId: string | null;
  title: string;
}

export interface DesktopWindowsBridge {
  openBook(bookId: string): Promise<void>;
  /** Brings up the main window, making it when there is none. */
  openLibrary(): Promise<void>;
  focus(windowId: number): Promise<void>;
  list(): Promise<DesktopWindowInfo[]>;
  /** Calls back with the whole list whenever it changes. Returns the unsubscribe. */
  onChange(cb: (windows: DesktopWindowInfo[]) => void): () => void;
  /** Each window says which book it shows (null for none) and its title. */
  setBook(bookId: string | null, title?: string): Promise<void>;
}

export interface DesktopBridge {
  syncFolder: SyncFolderBridge;
  window: WindowBridge;
  /** Text recognition for scanned PDF pages (src/pdf/ocr). */
  ocr?: DesktopOcrBridge;
  /** BlobStore files (src/blobStore/fsBackend.ts). Optional so a page never assumes it. */
  blobs?: BlobFilesBridge;
  /** Books opened where they are (src/openInPlace). */
  files?: DesktopFilesBridge;
  /** The open windows (src/openInPlace). */
  windows?: DesktopWindowsBridge;
  /** Finding books on this computer (src/openInPlace). */
  scan?: DesktopScanBridge;
}

declare global {
  interface Window {
    arabicReaderDesktop?: DesktopBridge;
  }
}

export function getFilesBridge(): DesktopFilesBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.files;
}

export function getScanBridge(): DesktopScanBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.scan;
}

export function getWindowsBridge(): DesktopWindowsBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.windows;
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
