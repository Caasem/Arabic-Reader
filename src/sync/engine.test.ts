import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ArabicReaderDB } from '../persistence/schema';
import { createSyncControl } from '../persistence/syncControl';
import { createWriteLayer } from '../persistence/writeLayer';
import { createSyncEngine } from './engine';
import { encodeBatch, batchPath } from './format';
import { memoryTransport, type SyncTransport } from './transport';
import { recordKey } from './types';

let counter = 0;

/** One simulated device: its own database, write layer and engine over a shared folder. */
async function device(name: string, transport: SyncTransport) {
  const db = new ArabicReaderDB(`engine-test-${name}-${counter++}`);
  await db.open();
  const layer = createWriteLayer(db);
  const control = createSyncControl(db);
  return {
    name,
    db,
    layer,
    control,
    engine: createSyncEngine({ db, transport }),
    async enable() {
      return control.enableSyncCapture(name);
    },
  };
}

const word = (id: string, meaning: string) => ({ id, surfaceForm: id, bookId: 'b1', addedAt: 1, meaning }) as never;
const meaningOf = async (d: Awaited<ReturnType<typeof device>>, id: string) =>
  ((await d.db.vocabulary.get(id)) as { meaning?: string } | undefined)?.meaning;

async function pair() {
  const folder = memoryTransport();
  const a = await device('A', folder);
  const b = await device('B', folder);
  await a.enable();
  await b.enable();
  return { folder, a, b };
}

describe('publishing and pulling', () => {
  it('a change on one device reaches the other, through immutable batch files', async () => {
    const { folder, a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    expect((await a.engine.syncNow()).published).toBe(1);

    const files = [...folder.files.keys()];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[^/]+\/batch-1-1-.+\.json$/);

    const result = await b.engine.syncNow();
    expect(result).toMatchObject({ filesRead: 1, eventsApplied: 1 });
    expect(await meaningOf(b, 'v1')).toBe('book');
  });

  it('seeds and shares data that existed before sync was turned on', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await a.db.vocabulary.put({ id: 'old', surfaceForm: 'old', bookId: 'b', addedAt: 5, updatedAt: 5, meaning: 'legacy' } as never);
    await a.enable();
    await a.engine.syncNow();
    const b = await device('B', folder);
    await b.enable();
    await b.engine.syncNow();
    expect(await meaningOf(b, 'old')).toBe('legacy');
  });

  it('a later edit is a plain update, not an overwrite, and sync does not echo back', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.layer.putSynced('vocabulary', word('v1', 'a book'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(await meaningOf(b, 'v1')).toBe('a book');
    expect(await b.db.activityLog.count()).toBe(0);
    // B only ever received; it created no events of its own.
    expect(await b.db.syncOutbox.count()).toBe(0);
    expect((await b.engine.syncNow()).published).toBe(0);
  });

  it('applying the same files again changes nothing', async () => {
    const { folder, a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    // A restored cloud copy: the same events again under a different batch id.
    const [path] = [...folder.files.keys()];
    const original = JSON.parse(folder.files.get(path) as string);
    folder.files.set(batchPath(original.deviceId, 1, 1, 'restored'), encodeBatch(original.deviceId, 'restored', original.events));
    const result = await b.engine.syncNow();
    expect(result.eventsApplied).toBe(0);
    expect(await b.db.vocabulary.count()).toBe(1);
  });

  it('propagates a delete', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.layer.deleteSynced('vocabulary', 'v1');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.db.vocabulary.count()).toBe(0);
    expect(await b.db.syncConflicts.count()).toBe(0);
  });
});

describe('concurrent changes', () => {
  it('both devices converge on the same winner and keep the loser for undo', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'seed'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await a.layer.putSynced('vocabulary', word('v1', 'from A'));
    await b.layer.putSynced('vocabulary', word('v1', 'from B'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    const [fromA, fromB] = [await meaningOf(a, 'v1'), await meaningOf(b, 'v1')];
    expect(fromA).toBe(fromB);
    for (const d of [a, b]) {
      const log = await d.db.activityLog.toArray();
      expect(log).toHaveLength(1);
      expect(['from A', 'from B']).toContain((log[0].loserPayload as { meaning: string }).meaning);
      expect((log[0].loserPayload as { meaning: string }).meaning).not.toBe(fromA);
    }
  });

  it('keeps the furthest reading position even when the other device\'s edit is newer', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('positions', { bookId: 'b1', cfi: 'a', percent: 0.8, updatedAt: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await b.layer.putSynced('positions', { bookId: 'b1', cfi: 'b', percent: 0.3, updatedAt: 2 });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.db.positions.get('b1'))?.percent).toBe(0.8);
    expect((await b.db.positions.get('b1'))?.percent).toBe(0.8);
  });

  it('a delete concurrent with an edit is kept as a conflict, with the edit still visible', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'seed'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await a.layer.deleteSynced('vocabulary', 'v1');
    await b.layer.putSynced('vocabulary', word('v1', 'edited on B'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    for (const d of [a, b]) {
      expect(await meaningOf(d, 'v1')).toBe('edited on B');
      const conflicts = await d.db.syncConflicts.toArray();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe(recordKey('vocabulary', 'v1'));
    }
  });

  it('a delete made after seeing the edit is not a conflict', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'seed'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await b.layer.putSynced('vocabulary', word('v1', 'edited on B'));
    await b.engine.syncNow();
    await a.engine.syncNow(); // A has now seen the edit
    await a.layer.deleteSynced('vocabulary', 'v1');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.db.vocabulary.count()).toBe(0);
    expect(await b.db.syncConflicts.count()).toBe(0);
    expect(await a.db.syncConflicts.count()).toBe(0);
  });

  it('three devices that sync in different orders end up identical', async () => {
    const folder = memoryTransport();
    const [a, b, c] = [await device('A', folder), await device('B', folder), await device('C', folder)];
    for (const d of [a, b, c]) await d.enable();
    await a.layer.putSynced('vocabulary', word('v1', 'A1'));
    await b.layer.putSynced('vocabulary', word('v1', 'B1'));
    await c.layer.putSynced('vocabulary', word('v2', 'C2'));
    await c.engine.syncNow();
    await a.engine.syncNow();
    await b.engine.syncNow();
    await b.layer.putSynced('vocabulary', word('v3', 'B3'));
    for (const d of [b, c, a, c, b, a]) await d.engine.syncNow();

    const snapshot = async (d: typeof a) => JSON.stringify((await d.db.vocabulary.toArray()).sort((x, y) => (x.id < y.id ? -1 : 1)).map((v) => [v.id, (v as { meaning?: string }).meaning]));
    expect(await snapshot(b)).toBe(await snapshot(a));
    expect(await snapshot(c)).toBe(await snapshot(a));
    expect(await a.db.vocabulary.count()).toBe(3);
  });
});

describe('bad or partial files', () => {
  it('skips a half-synced file, applies nothing, and picks it up once it is complete', async () => {
    const { folder, a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    const [path] = [...folder.files.keys()];
    const full = folder.files.get(path) as string;

    folder.files.set(path, full.slice(0, full.length - 20));
    const early = await b.engine.syncNow();
    expect(early).toMatchObject({ filesRead: 0, retryLater: 1, eventsApplied: 0 });
    expect(await b.db.vocabulary.count()).toBe(0);

    folder.files.set(path, full);
    const later = await b.engine.syncNow();
    expect(later.eventsApplied).toBe(1);
    expect(await meaningOf(b, 'v1')).toBe('book');
  });

  it('a file whose declared count does not match is treated as incomplete', async () => {
    const { folder, a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    const [path] = [...folder.files.keys()];
    const file = JSON.parse(folder.files.get(path) as string);
    folder.files.set(path, JSON.stringify({ ...file, count: 2 }));
    expect((await b.engine.syncNow()).retryLater).toBe(1);
    expect(await b.db.vocabulary.count()).toBe(0);
  });

  it('rejects events that claim to be from a different device than the folder they sit in', async () => {
    const { folder, a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    const [path] = [...folder.files.keys()];
    const file = JSON.parse(folder.files.get(path) as string);
    folder.files.set(path.replace(/^[^/]+/, 'someone-else'), JSON.stringify(file));
    folder.files.delete(path);
    expect((await b.engine.syncNow()).filesRead).toBe(0);
    expect(await b.db.vocabulary.count()).toBe(0);
  });

  it('counts files from a newer app version instead of applying them', async () => {
    const { folder, b } = await pair();
    folder.files.set('future-device/batch-1-1-x.json', JSON.stringify({ formatVersion: 99, kind: 'batch' }));
    expect((await b.engine.syncNow()).fromNewerVersion).toBe(1);
  });

  it('republishing after a crash between the file write and the outbox update is harmless', async () => {
    const { a, b } = await pair();
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await a.engine.syncNow();
    // Simulate the crash: the file exists but the outbox rows were never marked published.
    await a.db.syncOutbox.toCollection().modify((row) => void delete row.publishedAt);
    expect((await a.engine.syncNow()).published).toBe(1);
    const result = await b.engine.syncNow();
    expect(result.filesRead).toBe(2);
    expect(result.eventsApplied).toBe(1); // the duplicate batch adds nothing
    expect(await b.db.vocabulary.count()).toBe(1);
  });
});
