import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBlobStore } from './blobStore';
import { blobStoreContract } from './contract';
import { BlobDB } from './db';
import { createIdbBackend } from './idbBackend';

let n = 0;
function freshDb(): BlobDB {
  return new BlobDB(`blobs-test-${++n}`);
}

blobStoreContract('IndexedDB', async () => {
  const db = freshDb();
  return { backend: createIdbBackend(db.blobs), index: db.blobIndex, cleanup: () => db.delete() };
});

// Where the Web Locks API is missing, the store falls back to a queue in the page.
describe('without Web Locks', () => {
  beforeAll(() => vi.stubGlobal('navigator', {}));
  afterAll(() => vi.unstubAllGlobals());
  blobStoreContract('IndexedDB, page queue', async () => {
    const db = freshDb();
    return { backend: createIdbBackend(db.blobs), index: db.blobIndex, cleanup: () => db.delete() };
  });
});

describe('IndexedDB backend', () => {
  it('verify catches bytes that changed under their hash', async () => {
    const db = freshDb();
    const store = createBlobStore({ backend: createIdbBackend(db.blobs), index: db.blobIndex });
    const { hash } = await store.put(new TextEncoder().encode('original'), { ns: 'book', owner: 'b1' });
    await db.blobs.put({ hash, data: new Blob(['tampered']) });
    expect(await store.verify(hash)).toBe(false);
    await db.delete();
  });
});
