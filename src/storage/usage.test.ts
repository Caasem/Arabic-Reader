import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBlobStoreForTests, type BlobStore } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { persistenceService } from '../persistence';
import { db } from '../persistence/schema';
import { putSynced } from '../persistence/writeLayer';
import type { BookMeta } from '../types';
import { clearCaches, estimateTableBytes, formatBytes, measureStorage } from './usage';

let n = 0;
let blobDb: BlobDB;
let store: BlobStore;

const book = (id: string, title: string): BookMeta => ({ id, title, format: 'epub', addedAt: 1, sizeBytes: 1 });
const file = (text: string) => new Blob([text.repeat(100)], { type: 'application/epub+zip' });
const noFonts = async () => [{ family: 'Lotus', bytes: 5000 }];

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  blobDb = new BlobDB(`usage-test-${++n}`);
  store = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
  setBlobStoreForTests(store);
});
afterEach(async () => {
  setBlobStoreForTests(null);
  await blobDb.delete();
});

const measure = () => measureStorage({ fonts: noFonts });
const group = async (id: string) => (await measure()).groups.find((g) => g.id === id)!;

describe('measuring storage', () => {
  it('lists books by size, largest first, and counts identical files once', async () => {
    await persistenceService.saveBook(book('b1', 'Small'), file('a')); // 100 bytes
    await persistenceService.saveBook(book('b2', 'Large'), file('bbbb')); // 400 bytes
    await persistenceService.saveBook(book('b3', 'Twin of large'), file('bbbb'));

    const files = await group('files');
    const books = files.items.filter((i) => i.kind === 'book');
    expect(books.map((b) => [b.label, b.bytes])).toEqual([
      ['Large', 400],
      ['Twin of large', 400],
      ['Small', 100],
    ]);
    expect(books.every((b) => b.hasFile)).toBe(true);
    // 500 bytes are stored, not 900: the twin shares the large file. The uploaded font adds its own size.
    expect(files.bytes).toBe(500 + 5000);
    expect(files.items.find((i) => i.kind === 'font')).toMatchObject({ id: 'Lotus', bytes: 5000 });
  });

  it('counts a book file that has not moved to the new store yet', async () => {
    await db.books.put({ ...book('old', 'Legacy'), updatedAt: 1 });
    await db.bookFiles.put({ bookId: 'old', data: file('xyz') });
    const files = await group('files');
    expect(files.items.find((i) => i.kind === 'book')).toMatchObject({ label: 'Legacy', bytes: 300, hasFile: true });
    expect(files.bytes).toBe(300 + 5000);
  });

  it('shows a removed file as nothing, and the record stays in "Your records"', async () => {
    await persistenceService.saveBook(book('b1', 'Gone'), file('a'));
    await persistenceService.removeBookFile('b1');
    expect((await group('files')).items.filter((i) => i.kind === 'book')).toEqual([]);
    const records = await group('records');
    expect(records.items.find((i) => i.id === 'books')?.bytes).toBeGreaterThan(0);
  });

  it('estimates tables from a sample, close to their real size', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: `h${i}`, bookId: 'b', bookTitle: 't', cfiRange: 'x', text: 'y'.repeat(100), color: 'yellow', createdAt: i, updatedAt: i }));
    await db.highlights.bulkPut(rows as never);
    const real = JSON.stringify(rows).length;
    const estimate = await estimateTableBytes(db.highlights);
    expect(estimate).toBeGreaterThan(real * 0.9);
    expect(estimate).toBeLessThan(real * 1.1);
    expect(await estimateTableBytes(db.vocabulary)).toBe(0);
  });

  it('puts records, packs and caches in their own groups, from the registry', async () => {
    await putSynced('highlights', { id: 'h1', bookId: 'b', bookTitle: 't', cfiRange: 'x', text: 'hello', color: 'yellow', createdAt: 1, updatedAt: 1 } as never);
    await db.sensePicks.put({ key: 'k', bookKey: 'b', updatedAt: 1 } as never);
    await db.bookLocations.put({ bookId: 'b', data: 'z'.repeat(5000), total: 10 });
    await db.packs.put({ id: 'alsihah', version: 1, title: 'Al-Sihah', files: [], size: 7_000_000, installedAt: 1 });
    await store.put(new Uint8Array(7000), { ns: 'pack', owner: 'alsihah@1' });

    const report = await measure();
    const records = report.groups.find((g) => g.id === 'records')!;
    expect(records.items.map((i) => i.id)).toEqual(expect.arrayContaining(['highlights', 'sensePicks']));
    expect(records.items.some((i) => i.id === 'bookLocations')).toBe(false);
    const caches = report.groups.find((g) => g.id === 'caches')!;
    expect(caches.items.find((i) => i.id === 'bookLocations')?.bytes).toBeGreaterThan(5000);
    const packs = report.groups.find((g) => g.id === 'packs')!;
    expect(packs.items).toEqual([{ id: 'alsihah', kind: 'pack', label: 'Al-Sihah', bytes: 7_000_000 }]);
    expect(packs.bytes).toBe(7000); // what is stored
  });

  it('reports no quota where the browser has none', async () => {
    const report = await measure();
    expect(report.quota).toBeUndefined();
    expect(report.persisted).toBeUndefined();
  });
});

describe('clearing caches', () => {
  it('empties the caches and touches nothing else', async () => {
    await putSynced('highlights', { id: 'h1', bookId: 'b', bookTitle: 't', cfiRange: 'x', text: 'keep me', color: 'yellow', createdAt: 1, updatedAt: 1 } as never);
    await db.wordInstances.put({ key: 'b::w', bookId: 'b', normalizedForm: 'w' } as never);
    await persistenceService.saveBook(book('b1', 'Keep'), file('a'));
    await db.bookLocations.put({ bookId: 'b', data: 'z', total: 1 });
    await db.packParts.put({ key: 'h:0', hash: 'h', index: 0, data: new Blob(['part']) });
    await db.packs.put({ id: 'p', version: 1, title: 'P', files: [], size: 1, installedAt: 1 });

    await clearCaches();
    expect(await db.bookLocations.count()).toBe(0);
    expect(await db.packParts.count()).toBe(0);
    expect(await db.highlights.count()).toBe(1);
    expect(await db.wordInstances.count()).toBe(1); // class L, but its counts cannot be rebuilt: never a cache
    expect(await db.packs.count()).toBe(1);
    expect(await persistenceService.getBookFileIds()).toEqual(['b1']);
  });
});

describe('formatBytes', () => {
  it('uses one decimal place', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(3.25 * 1024 ** 3)).toBe('3.3 GB');
  });
});
