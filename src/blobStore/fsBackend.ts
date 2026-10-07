import type { ByteBackend } from './types';

/**
 * The desktop app's `blobs:*` bridge (electron/preload.cjs, electron/blobFiles.cjs).
 * Paths never cross it: the renderer names a blob by its hash only.
 */
export interface BlobFilesBridge {
  write(hash: string, bytes: Uint8Array): Promise<void>;
  read(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;
  remove(hash: string): Promise<void>;
  list(): Promise<string[]>;
}

/** Bytes as files under the desktop app's user-data folder. */
export function createFsBackend(bridge: BlobFilesBridge): ByteBackend {
  return {
    name: 'files',
    async write(hash, data) {
      await bridge.write(hash, new Uint8Array(await data.arrayBuffer()));
    },
    async read(hash, type) {
      const bytes = await bridge.read(hash);
      return bytes ? new Blob([bytes as Uint8Array<ArrayBuffer>], { type }) : undefined;
    },
    has: (hash) => bridge.has(hash),
    delete: (hash) => bridge.remove(hash),
    hashes: () => bridge.list(),
  };
}
