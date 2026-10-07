import type { Table } from 'dexie';
import type { BlobBytesRow } from './db';
import type { ByteBackend } from './types';

/** Bytes as Blobs in the BlobStore's IndexedDB database. Works on every platform (decision D1). */
export function createIdbBackend(blobs: Table<BlobBytesRow, string>): ByteBackend {
  return {
    name: 'indexeddb',
    async write(hash, data) {
      await blobs.put({ hash, data });
    },
    async read(hash, type) {
      const data = (await blobs.get(hash))?.data;
      if (!data) return undefined;
      return data.type === type ? data : data.slice(0, data.size, type);
    },
    async has(hash) {
      return (await blobs.where('hash').equals(hash).count()) > 0;
    },
    async delete(hash) {
      await blobs.delete(hash);
    },
    async hashes() {
      return (await blobs.toCollection().primaryKeys()) as string[];
    },
  };
}
