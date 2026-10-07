import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBlobStoreForTests, sha256Hex, type BlobStore } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { DuplicateBookError, libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import { migrateBookFile, migrateBookFiles } from './bookFileMigration';
import { persistenceService } from './db';
import { db } from './schema';
import { enableSyncCapture } from './syncControl';

const meta = (id: string): BookMeta => ({ id, title: `Book ${id}`, format: 'epub', addedAt: 1, sizeBytes: 1 });
const bytes = (s: string) => new Blob([s], { type: 'application/epub+zip' });

let n = 0;
let blobDb: BlobDB;
let store: BlobStore;

async function clearEverything(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
  await blobDb.blobs.clear();
  await blobDb.blobIndex.clear();
}

beforeEach(async () => {
  await db.open();
  blobDb = new BlobDB(`book-files-test-${++n}`);
  store = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
  setBlobStoreForTests(store);
  await clearEverything();
});
afterEach(async () => {
  vi.restoreAllMocks();
  setBlobStoreForTests(null);
  await blobDb.delete();
});

/** A book as it was stored before v13: a record with no fileHash, and its file in `bookFiles`. */
async function seedLegacyBook(id: string, content: string): Promise<void> {
  await db.books.put({ ...meta(id), updatedAt: 5 });
  await db.bookFiles.put({ bookId: id, data: bytes(content) });
}

const read = async (id: string) => (await persistenceService.getBookFile(id))?.text();

describe('book files in the BlobStore', () => {
  it('saves a book into the store and points the record at it', async () => {
    await persistenceService.saveBook(meta('b1'), bytes('epub one'));
    const hash = await sha256Hex(new TextEncoder().encode('epub one'));
    expect((await persistenceService.getBook('b1'))?.fileHash).toBe(hash);
    expect(await db.bookFiles.count()).toBe(0);
    expect(await store.has(hash)).toBe(true);
    expect(await read('b1')).toBe('epub one');
    expect(await persistenceService.getBookFileIds()).toEqual(['b1']);
  });

  it('stores identical files once, and frees the bytes only when the last book goes', async () => {
    await persistenceService.saveBook(meta('b1'), bytes('same'));
    await persistenceService.saveBook(meta('b2'), bytes('same'));
    expect(await store.usage()).toEqual({ book: { count: 1, bytes: 4 } });

    await persistenceService.deleteBook('b1');
    expect(await read('b2')).toBe('same');
    await persistenceService.deleteBook('b2');
    expect(await store.usage()).toEqual({});
    expect(await persistenceService.getBookFileIds()).toEqual([]);
  });

  it("keeps a synced book's file when the identical local book is deleted first", async () => {
    await persistenceService.saveBook(meta('mine'), bytes('shared'));
    const hash = (await persistenceService.getBook('mine'))!.fileHash!;
    // The other device's record arrives naming the same bytes; nothing has pinned them for it yet.
    await db.books.put({ ...meta('theirs'), fileHash: hash, updatedAt: 9 });
    expect(await persistenceService.getBookFileIds()).toContain('theirs');

    await persistenceService.deleteBook('mine');
    expect(await read('theirs')).toBe('shared');
  });

  it("replaces a book's file and releases the old bytes", async () => {
    await persistenceService.saveBook(meta('b1'), bytes('old'));
    await persistenceService.saveBookFile('b1', bytes('new'));
    expect(await read('b1')).toBe('new');
    expect(await store.usage()).toEqual({ book: { count: 1, bytes: 3 } });
  });

  it('reports a synced book without bytes as having no file, until one is attached', async () => {
    await db.books.put({ ...meta('synced'), fileHash: 'a'.repeat(64), updatedAt: 9 });
    expect(await persistenceService.getBookFileIds()).toEqual([]);
    expect(await read('synced')).toBeUndefined();
    await persistenceService.saveBookFile('synced', bytes('arrived'));
    expect(await persistenceService.getBookFileIds()).toEqual(['synced']);
    expect(await read('synced')).toBe('arrived');
  });

  it('puts fileHash in the sync event, as a reference and not the file', async () => {
    await enableSyncCapture();
    await persistenceService.saveBook(meta('b1'), bytes('epub'));
    const events = await db.syncOutbox.toArray();
    const payload = events.find((e) => e.table === 'books')?.payload as Record<string, unknown>;
    expect(payload.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(events)).not.toContain('epub+zip');
  });
});

describe('importing a file that is already in the library', () => {
  it('refuses it and stores nothing new', async () => {
    await persistenceService.saveBook(meta('b1'), bytes('the book'));
    const err = await libraryService.importEpub(new File(['the book'], 'again.epub')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicateBookError);
    expect((err as DuplicateBookError).message).toBe('"Book b1" is already in your library.');
    expect(await db.books.count()).toBe(1);
    expect(await store.usage()).toEqual({ book: { count: 1, bytes: 8 } });
  });

  it('attaches the file to a synced book that was waiting for it, instead of adding a second book', async () => {
    const hash = await sha256Hex(new TextEncoder().encode('the book'));
    await db.books.put({ ...meta('synced'), fileHash: hash, updatedAt: 9 });
    const result = await libraryService.importEpub(new File(['the book'], 'mine.epub'));
    expect(result.id).toBe('synced');
    expect(await db.books.count()).toBe(1);
    expect(await read('synced')).toBe('the book');
  });
});

describe('migrating existing book files', () => {
  it('moves every file, keeps the records, empties bookFiles and reads the same bytes', async () => {
    await seedLegacyBook('b1', 'one');
    await seedLegacyBook('b2', 'two');
    await seedLegacyBook('b3', 'two'); // an identical import
    expect(await read('b1')).toBe('one'); // before: read from the old table

    const result = await migrateBookFiles({ store });
    expect(result).toEqual({ state: 'done', total: 3, moved: 3, failed: 0 });
    expect(await db.bookFiles.count()).toBe(0);
    expect(await Promise.all(['b1', 'b2', 'b3'].map(read))).toEqual(['one', 'two', 'two']);
    expect((await db.books.get('b1'))?.title).toBe('Book b1');
    expect(await store.usage()).toEqual({ book: { count: 2, bytes: 6 } });

    // Running it again is a no-op.
    expect(await migrateBookFiles({ store })).toMatchObject({ total: 0, moved: 0, failed: 0 });
  });

  it('never loses a book when it is killed at any step, and finishes on the next run', async () => {
    const calls = ['put', 'has', 'get', 'pin', 'unpin'] as const;
    const crashingStore = (dieAt: number): { store: BlobStore; count: () => number } => {
      let count = 0;
      const wrapped = Object.create(store) as BlobStore;
      for (const name of calls) {
        (wrapped as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
          if (++count === dieAt) throw new Error(`killed at store call ${dieAt}`);
          return (store[name] as (...a: unknown[]) => unknown)(...args);
        };
      }
      return { store: wrapped, count: () => count };
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Count the store calls in a clean run, then die at each one in turn.
    await seedLegacyBook('b1', 'one');
    await seedLegacyBook('b2', 'two');
    const clean = crashingStore(Infinity);
    await migrateBookFiles({ store: clean.store });
    const total = clean.count();
    expect(total).toBeGreaterThan(4);

    for (let dieAt = 1; dieAt <= total; dieAt++) {
      await clearEverything();
      await seedLegacyBook('b1', 'one');
      await seedLegacyBook('b2', 'two');
      await migrateBookFiles({ store: crashingStore(dieAt).store });
      expect([await read('b1'), await read('b2')], `after a kill at store call ${dieAt}`).toEqual(['one', 'two']);

      const result = await migrateBookFiles({ store });
      expect(result.failed, `rerun after a kill at ${dieAt}`).toBe(0);
      expect(await db.bookFiles.count()).toBe(0);
      expect([await read('b1'), await read('b2')]).toEqual(['one', 'two']);
      expect((await store.usage()).book).toEqual({ count: 2, bytes: 6 });
    }
  });

  it('survives a kill after the book points at the bytes but before the old row is deleted', async () => {
    await seedLegacyBook('b1', 'one');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const del = vi.spyOn(db.bookFiles, 'delete').mockRejectedValueOnce(new Error('killed'));
    expect(await migrateBookFile('b1', store)).toBe('failed');
    expect((await db.books.get('b1'))?.fileHash).toBeTruthy();
    expect(await db.bookFiles.count()).toBe(1); // the old copy is still there
    expect(await read('b1')).toBe('one');

    del.mockRestore();
    expect(await migrateBookFile('b1', store)).toBe('cleaned');
    expect(await db.bookFiles.count()).toBe(0);
    expect(await read('b1')).toBe('one');
    expect(await store.usage()).toEqual({ book: { count: 1, bytes: 3 } });
  });

  it('leaves a file it cannot move where it is, and moves the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedLegacyBook('good', 'fine');
    await db.books.put({ ...meta('bad'), updatedAt: 5 });
    await db.bookFiles.put({ bookId: 'bad', data: 'not a blob' as unknown as Blob });
    await db.bookFiles.put({ bookId: 'no-record', data: bytes('orphan') });

    expect(await migrateBookFiles({ store })).toEqual({ state: 'done', total: 3, moved: 1, failed: 1 });
    expect((await db.bookFiles.toCollection().primaryKeys()).sort()).toEqual(['bad', 'no-record']);
    expect(await read('good')).toBe('fine');
  });

  it('stops when the storage is full, leaving every book readable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedLegacyBook('b1', 'one');
    const full = Object.create(store) as BlobStore;
    full.put = () => Promise.reject(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }));
    expect(await migrateBookFiles({ store: full })).toMatchObject({ moved: 0, failed: 1 });
    expect(await read('b1')).toBe('one');
    expect(await store.usage()).toEqual({});
  });

  it('does not keep a reference for a book deleted while its file was moving', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedLegacyBook('b1', 'one');
    const slow = Object.create(store) as BlobStore;
    slow.has = async (hash) => {
      await persistenceService.deleteBook('b1'); // the reader removes the book mid-move
      return store.has(hash);
    };
    expect(await migrateBookFile('b1', slow)).toBe('failed');
    expect(await store.usage()).toEqual({});
  });

  it('stops between books when asked, and the next run finishes', async () => {
    await seedLegacyBook('b1', 'one');
    await seedLegacyBook('b2', 'two');
    let calls = 0;
    const first = await migrateBookFiles({ store, shouldStop: () => ++calls > 1 });
    expect(first.moved).toBe(1);
    expect(await db.bookFiles.count()).toBe(1);
    expect(await migrateBookFiles({ store })).toMatchObject({ moved: 1, failed: 0 });
    expect(await db.bookFiles.count()).toBe(0);
  });
});

describe('the v13 upgrade', () => {
  it('opens a v12 database unchanged and lets its books migrate afterwards', async () => {
    db.close();
    await Dexie.delete('arabic-reader');
    const old = new Dexie('arabic-reader');
    old.version(12).stores({
      books: 'id, addedAt, title',
      bookFiles: 'bookId',
      positions: 'bookId',
      wordInstances: 'key, bookId, normalizedForm, lemma',
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, fsrsDue, [bookId+surfaceForm]',
      highlights: 'id, bookId, createdAt',
      preferences: 'id',
      speedReaderPositions: 'bookId, updatedAt',
      speedReaderSessions: 'id, bookId, endedAt',
      readingSessions: 'id, bookId, startedAt, endedAt',
      bookmarks: 'id, bookId, createdAt',
      bookLocations: 'bookId',
      pomodoroSessions: 'id, bookId, phase, status, startedAt',
      syncMeta: 'id',
      syncOutbox: 'eventId, publishedAt',
      recordFrontier: 'key',
      activityLog: 'id, at',
      syncConflicts: 'key',
      sensePicks: 'key, bookKey, updatedAt',
      crowdState: 'id',
      crowdQueue: 'key, rev',
      crowdPacks: 'path',
    });
    await old.table('books').bulkPut([
      { ...meta('b1'), updatedAt: 7 },
      { ...meta('b2'), updatedAt: 8 },
    ]);
    await old.table('bookFiles').bulkPut([
      { bookId: 'b1', data: bytes('one') },
      { bookId: 'b2', data: bytes('two') },
    ]);
    await old.table('vocabulary').put({ id: 'v1', surfaceForm: 'x', bookId: 'b1', addedAt: 1, updatedAt: 3 });
    old.close();

    await db.open();
    expect(db.verno).toBe(13);
    expect((await db.books.orderBy('id').toArray())).toEqual([
      { ...meta('b1'), updatedAt: 7 },
      { ...meta('b2'), updatedAt: 8 },
    ]);
    expect(await db.vocabulary.count()).toBe(1);
    expect(await db.bookFiles.count()).toBe(2); // the upgrade moved nothing
    expect(await read('b1')).toBe('one'); // and reading works at once

    expect(await migrateBookFiles({ store })).toMatchObject({ moved: 2, failed: 0 });
    expect(await Promise.all(['b1', 'b2'].map(read))).toEqual(['one', 'two']);
    expect((await db.books.get('b1'))?.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
