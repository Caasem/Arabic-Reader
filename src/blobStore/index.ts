/**
 * BlobStore (roadmap `blob-store`, docs/specs/data-architecture.md 5.2, M1b).
 *
 * Nothing in the app uses it yet: book files move onto it in M1c, fonts and
 * personal dictionaries in M1d. Touch points outside this folder:
 * - src/storage/registry.ts declares its database (`arabic-reader-blobs`) and
 *   its namespaces; `put` refuses an undeclared namespace.
 * - electron/blobFiles.cjs, the `blobs:*` handlers in electron/main.cjs and
 *   `blobs` in electron/preload.cjs: the desktop file backend.
 * - src/sync/desktopBridge.ts: the optional `blobs` member of DesktopBridge.
 */
import { BlobDB } from './db';
import { createBlobStore } from './blobStore';
import { createFsBackend, type BlobFilesBridge } from './fsBackend';
import { createIdbBackend } from './idbBackend';
import type { BlobStore } from './types';

export type { BlobRef, BlobStore, BlobUsage, ByteBackend, RepairReport } from './types';
export { QuotaError, UndeclaredNamespaceError } from './types';
export { sha256Hex } from './hash';

let store: BlobStore | null = null;

function desktopBlobs(): BlobFilesBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.arabicReaderDesktop?.blobs;
}

/** Tests swap in a store over their own databases; pass null to go back to the app's. */
export function setBlobStoreForTests(replacement: BlobStore | null): void {
  store = replacement;
}

/** The app's BlobStore: files on disk in the desktop app, IndexedDB everywhere else. Opened on first use. */
export function getBlobStore(): BlobStore {
  if (!store) {
    const db = new BlobDB();
    const files = desktopBlobs();
    store = createBlobStore({ backend: files ? createFsBackend(files) : createIdbBackend(db.blobs), index: db.blobIndex });
  }
  return store;
}
