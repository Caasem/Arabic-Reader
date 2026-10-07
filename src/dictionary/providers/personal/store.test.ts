import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBlobStoreForTests, type BlobStore } from '../../../blobStore';
import { createBlobStore } from '../../../blobStore/blobStore';
import { BlobDB } from '../../../blobStore/db';
import { createIdbBackend } from '../../../blobStore/idbBackend';
import type { PersonalRow } from './parse';
import { clearPersonalDictionary, loadPersonalDictionary, savePersonalDictionary } from './store';

let n = 0;
let blobDb: BlobDB;
let blobs: BlobStore;

// The store's own database, opened the way it opens it, to look at what is really kept.
const rawSlot = async () => {
  const raw = new Dexie('arabic-reader-personal-dictionary');
  try {
    await raw.open();
    return (await raw.table('dictionaries').get('current')) as Record<string, unknown> | undefined;
  } finally {
    raw.close();
  }
};

const rows = (...words: string[]): PersonalRow[] => words.map((w) => [w, `meaning of ${w}`] as unknown as PersonalRow);

beforeEach(async () => {
  blobDb = new BlobDB(`personal-test-${++n}`);
  blobs = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
  setBlobStoreForTests(blobs);
  await clearPersonalDictionary();
  await blobs.usage();
});
afterEach(async () => {
  vi.restoreAllMocks();
  setBlobStoreForTests(null);
  await blobDb.delete();
});

describe('personal dictionary in the BlobStore', () => {
  it('keeps the rows in the store and only the label and a reference in the slot', async () => {
    await savePersonalDictionary('Mine', rows('كتاب', 'قلم'));
    const slot = await rawSlot();
    expect(slot).toMatchObject({ id: 'current', label: 'Mine', fileHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(slot?.rows).toBeUndefined();
    expect((await blobs.usage()).dictionary.count).toBe(1);

    expect(await loadPersonalDictionary()).toMatchObject({ label: 'Mine', rows: rows('كتاب', 'قلم') });
  });

  it('replaces the dictionary and releases the old rows; clearing frees them', async () => {
    await savePersonalDictionary('One', rows('a'));
    await savePersonalDictionary('Two', rows('b', 'c'));
    expect((await loadPersonalDictionary())?.label).toBe('Two');
    expect((await blobs.usage()).dictionary.count).toBe(1);

    await savePersonalDictionary('Two again', rows('b', 'c')); // the same rows: still one file
    expect((await blobs.usage()).dictionary.count).toBe(1);
    expect((await loadPersonalDictionary())?.rows).toEqual(rows('b', 'c'));

    await clearPersonalDictionary();
    expect(await loadPersonalDictionary()).toBeUndefined();
    expect(await blobs.usage()).toEqual({});
  });

  it('moves a dictionary stored the old way (rows inline) and loads it unchanged', async () => {
    const raw = new Dexie('arabic-reader-personal-dictionary');
    await raw.open();
    await raw.table('dictionaries').put({ id: 'current', label: 'Old', rows: rows('x', 'y'), importedAt: 7 });
    raw.close();

    expect(await loadPersonalDictionary()).toEqual({ id: 'current', label: 'Old', rows: rows('x', 'y'), importedAt: 7 });
    const slot = await rawSlot();
    expect(slot?.rows).toBeUndefined();
    expect(slot?.fileHash).toBeTruthy();
    expect(slot?.importedAt).toBe(7);
    expect((await loadPersonalDictionary())?.rows).toEqual(rows('x', 'y')); // now from the store
  });

  it('keeps an old-style dictionary working when the move fails, and moves it next time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const raw = new Dexie('arabic-reader-personal-dictionary');
    await raw.open();
    await raw.table('dictionaries').put({ id: 'current', label: 'Old', rows: rows('x'), importedAt: 7 });
    raw.close();

    setBlobStoreForTests({ ...blobs, put: () => Promise.reject(new Error('full')) } as BlobStore);
    expect((await loadPersonalDictionary())?.rows).toEqual(rows('x'));
    expect((await rawSlot())?.rows).toEqual(rows('x')); // untouched

    setBlobStoreForTests(blobs);
    expect((await loadPersonalDictionary())?.rows).toEqual(rows('x'));
    expect((await rawSlot())?.rows).toBeUndefined();
  });

  it('reads as no dictionary when the stored rows are gone, and a new import fixes it', async () => {
    await savePersonalDictionary('Mine', rows('a'));
    const hash = (await rawSlot())!.fileHash as string;
    await blobs.unpin(hash, 'dictionary', 'personal'); // bytes lost outside the app
    expect(await loadPersonalDictionary()).toBeUndefined();
    await savePersonalDictionary('Mine', rows('a'));
    expect((await loadPersonalDictionary())?.rows).toEqual(rows('a'));
  });
});
