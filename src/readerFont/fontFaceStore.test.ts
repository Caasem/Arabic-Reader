import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex, type BlobStore } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { createFaceStore, FontDB, type FaceStore, type StoredFace } from './fontFaceStore';

let n = 0;
let fontDb: FontDB;
let blobDb: BlobDB;
let blobs: BlobStore;
let faces: FaceStore;

beforeEach(() => {
  fontDb = new FontDB(`fonts-test-${++n}`);
  blobDb = new BlobDB(`fonts-blobs-test-${n}`);
  blobs = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
  faces = createFaceStore(fontDb, () => blobs);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fontDb.delete();
  await blobDb.delete();
});

const face = (id: string, family: string, content: string, extra: Partial<StoredFace> = {}): StoredFace => ({
  id,
  family,
  subfamily: 'Regular',
  weight: 400,
  italic: false,
  fileName: `${family}.ttf`,
  data: new Blob([content], { type: 'font/ttf' }),
  addedAt: n * 1000 + Number(id.replace(/\D/g, '') || 0),
  ...extra,
});

const text = async (f: StoredFace) => f.data.text();

describe('uploaded fonts in the BlobStore', () => {
  it('keeps the file in the store and only its details in the database', async () => {
    await faces.add(face('f1', 'Lotus', 'font bytes'), []);
    const row = (await fontDb.faces.toArray())[0];
    expect(row.data).toBeUndefined();
    expect(row.fileHash).toBe(await sha256Hex(new TextEncoder().encode('font bytes')));
    expect(await blobs.usage()).toEqual({ font: { count: 1, bytes: 10 } });

    const loaded = await faces.load();
    expect(loaded.map((f) => f.family)).toEqual(['Lotus']);
    expect(await text(loaded[0])).toBe('font bytes');
    expect(loaded[0].data.type).toBe('font/ttf');
  });

  it('releases the old file when a weight is replaced, and all files when a family is removed', async () => {
    await faces.add(face('f1', 'Lotus', 'old'), []);
    const [old] = await faces.load();
    await faces.add(face('f2', 'Lotus', 'new'), [old]);
    await faces.add(face('f3', 'Lotus', 'bold', { weight: 700 }), []);
    expect((await blobs.usage()).font).toEqual({ count: 2, bytes: 7 });

    await faces.removeFamily('Lotus');
    expect(await fontDb.faces.count()).toBe(0);
    expect(await blobs.usage()).toEqual({});
  });

  it('stores the same font file once when two faces share it', async () => {
    await faces.add(face('f1', 'A', 'shared'), []);
    await faces.add(face('f2', 'B', 'shared'), []);
    expect(await blobs.usage()).toEqual({ font: { count: 1, bytes: 6 } });
    await faces.removeFamily('A');
    expect(await text((await faces.load())[0])).toBe('shared');
    await faces.removeFamily('B');
    expect(await blobs.usage()).toEqual({});
  });

  it('moves fonts stored the old way (file inline) and loads them unchanged', async () => {
    await fontDb.faces.bulkPut([
      { ...face('f1', 'Lotus', 'inline one'), data: new Blob(['inline one'], { type: 'font/ttf' }) },
      { ...face('f2', 'Naskh', 'inline two') },
    ]);
    const loaded = await faces.load();
    expect(await Promise.all(loaded.map(text))).toEqual(['inline one', 'inline two']);
    const rows = await fontDb.faces.toArray();
    expect(rows.every((r) => r.data === undefined && /^[0-9a-f]{64}$/.test(r.fileHash!))).toBe(true);
    expect(await blobs.usage()).toEqual({ font: { count: 2, bytes: 20 } });
    // And once more, from the store alone.
    expect(await Promise.all((await faces.load()).map(text))).toEqual(['inline one', 'inline two']);
  });

  it('keeps an old-style font working when the move fails, and moves it next time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await fontDb.faces.put(face('f1', 'Lotus', 'inline'));
    const broken = createFaceStore(fontDb, () => ({ ...blobs, put: () => Promise.reject(new Error('full')) }) as BlobStore);
    expect(await text((await broken.load())[0])).toBe('inline');
    expect((await fontDb.faces.get('f1'))?.data).toBeInstanceOf(Blob); // untouched

    expect(await text((await faces.load())[0])).toBe('inline');
    expect((await fontDb.faces.get('f1'))?.data).toBeUndefined();
  });

  it('survives a kill between storing the file and updating the row', async () => {
    await fontDb.faces.put(face('f1', 'Lotus', 'inline'));
    // The file reached the store, the row still has it inline.
    await blobs.put(new Blob(['inline'], { type: 'font/ttf' }), { ns: 'font', owner: 'f1', type: 'font/ttf' });
    expect(await text((await faces.load())[0])).toBe('inline');
    expect(await blobs.usage()).toEqual({ font: { count: 1, bytes: 6 } });
  });

  it('skips a font whose file is gone without losing the others, and drops references nothing lists', async () => {
    await faces.add(face('f1', 'Lotus', 'one'), []);
    await faces.add(face('f2', 'Naskh', 'two'), []);
    const gone = (await fontDb.faces.get('f1'))!.fileHash!;
    await blobs.unpin(gone, 'font', 'f1'); // bytes lost outside the app
    await blobs.put(new Blob(['stray']), { ns: 'font', owner: 'removed-face' }); // a removal cut short

    expect((await faces.load()).map((f) => f.family)).toEqual(['Naskh']);
    expect(await fontDb.faces.count()).toBe(2); // the details stay, so a re-upload replaces them
    expect(await blobs.usage()).toEqual({ font: { count: 1, bytes: 3 } });
  });

  it('leaves nothing behind when the database write fails', async () => {
    vi.spyOn(fontDb.faces, 'put').mockRejectedValueOnce(new Error('blocked'));
    await expect(faces.add(face('f1', 'Lotus', 'one'), [])).rejects.toThrow('blocked');
    expect(await blobs.usage()).toEqual({});
  });
});
