import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArabicReaderDB } from '../persistence/schema';
import { createSyncControl } from '../persistence/syncControl';
import { createWriteLayer } from '../persistence/writeLayer';
import { createSyncEngine } from './engine';
import { parseBatchPath, parseSnapshotPath } from './format';
import { memoryTransport, type SyncTransport } from './transport';

let counter = 0;
afterEach(() => vi.restoreAllMocks());
const DAY = 24 * 60 * 60 * 1000;

/** A device that writes a snapshot every 3 applied events, with a controllable clock. */
async function device(name: string, folder: SyncTransport, clock = { now: Date.now() }) {
  const db = new ArabicReaderDB(`snap-${name}-${counter++}`);
  await db.open();
  await createSyncControl(db).enableSyncCapture(name);
  return {
    db,
    clock,
    layer: createWriteLayer(db),
    engine: createSyncEngine({ db, transport: folder, snapshotEvery: 3, now: () => clock.now }),
  };
}

const word = (id: string, meaning: string) => ({ id, surfaceForm: id, bookId: 'b', addedAt: 1, meaning }) as never;
const meanings = async (d: Awaited<ReturnType<typeof device>>) =>
  JSON.stringify((await d.db.vocabulary.toArray()).map((v) => [v.id, (v as { meaning?: string }).meaning]).sort());
const filesOf = (folder: ReturnType<typeof memoryTransport>, kind: 'batch' | 'snapshot') =>
  [...folder.files.keys()].filter((p) => (kind === 'batch' ? parseBatchPath(p) : parseSnapshotPath(p)));

async function fiveWords(a: Awaited<ReturnType<typeof device>>) {
  for (let i = 1; i <= 5; i++) await a.layer.putSynced('vocabulary', word(`v${i}`, `meaning ${i}`));
}

describe('writing snapshots', () => {
  it('writes one once enough events have been applied, and replaces its own older one', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await fiveWords(a);
    const first = await a.engine.syncNow();
    expect(first.snapshotWritten).toBe(true);
    expect(filesOf(folder, 'snapshot')).toHaveLength(1);

    for (let i = 6; i <= 9; i++) await a.layer.putSynced('vocabulary', word(`v${i}`, `meaning ${i}`));
    const second = await a.engine.syncNow();
    expect(second.snapshotWritten).toBe(true);
    const snapshots = filesOf(folder, 'snapshot');
    expect(snapshots).toHaveLength(1); // the old one is gone
    expect(parseSnapshotPath(snapshots[0])?.gen).toBe(2);
  });

  it('does not write one before the threshold', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await a.layer.putSynced('vocabulary', word('v1', 'one'));
    expect((await a.engine.syncNow()).snapshotWritten).toBe(false);
    expect(filesOf(folder, 'snapshot')).toHaveLength(0);
  });
});

describe('a device that joins from a snapshot', () => {
  it('gets everything even after the original batch files are gone', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await fiveWords(a);
    await a.engine.syncNow();
    for (const path of filesOf(folder, 'batch')) folder.files.delete(path); // as if long since pruned

    const b = await device('B', folder);
    const result = await b.engine.syncNow();
    expect(result.eventsApplied).toBe(5);
    expect(await meanings(b)).toBe(await meanings(a));
  });

  it('ends up exactly where replaying every batch would have', async () => {
    const viaBatches = memoryTransport();
    const a1 = await device('A', viaBatches);
    await fiveWords(a1);
    await a1.engine.syncNow();
    for (const path of filesOf(viaBatches, 'snapshot')) viaBatches.files.delete(path);
    const b1 = await device('B', viaBatches);
    await b1.engine.syncNow();

    const viaSnapshot = memoryTransport();
    const a2 = await device('A', viaSnapshot);
    await fiveWords(a2);
    await a2.engine.syncNow();
    for (const path of filesOf(viaSnapshot, 'batch')) viaSnapshot.files.delete(path);
    const b2 = await device('B', viaSnapshot);
    await b2.engine.syncNow();

    expect(await meanings(b1)).toBe(await meanings(b2));
    expect(await b1.db.vocabulary.count()).toBe(5);
  });

  it('keeps a concurrent conflict, so the loser is still available for undo', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const b = await device('B', folder);
    await a.layer.putSynced('vocabulary', word('v1', 'seed'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.layer.putSynced('vocabulary', word('v1', 'from A'));
    await b.layer.putSynced('vocabulary', word('v1', 'from B'));
    await a.layer.putSynced('vocabulary', word('v2', 'x'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(filesOf(folder, 'snapshot').length).toBeGreaterThan(0);
    for (const path of filesOf(folder, 'batch')) folder.files.delete(path);

    const c = await device('C', folder);
    await c.engine.syncNow();
    expect(await meanings(c)).toBe(await meanings(a));
    expect(await c.db.activityLog.count()).toBe(1); // the losing edit is not lost
  });

  it('keeps a delete, and a stale copy of the old edit cannot bring the word back', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await a.layer.putSynced('vocabulary', word('v1', 'seed'));
    await a.engine.syncNow();
    const [oldBatch] = filesOf(folder, 'batch');
    const staleCopy = folder.files.get(oldBatch) as string;
    await a.layer.deleteSynced('vocabulary', 'v1');
    await a.layer.putSynced('vocabulary', word('v2', 'x'));
    await a.layer.putSynced('vocabulary', word('v3', 'y'));
    await a.engine.syncNow();
    expect(filesOf(folder, 'snapshot')).toHaveLength(1);
    for (const path of filesOf(folder, 'batch')) folder.files.delete(path);

    const b = await device('B', folder);
    await b.engine.syncNow();
    expect(await b.db.vocabulary.get('v1')).toBeUndefined();

    // The same old file reappearing in A's folder (a restored cloud copy), under another batch id.
    const aId = oldBatch.split('/')[0];
    folder.files.set(`${aId}/batch-1-1-stale.json`, staleCopy);
    await b.engine.syncNow();
    expect(await b.db.vocabulary.get('v1')).toBeUndefined();
  });

  it('a replayed batch that a snapshot already covers changes nothing', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await fiveWords(a);
    await a.engine.syncNow();
    const b = await device('B', folder);
    await b.engine.syncNow();
    // B already holds A's snapshot; the batch files being read again must be no-ops.
    await b.db.syncMeta.update('local', { processedFiles: [] });
    expect((await b.engine.syncNow()).eventsApplied).toBe(0);
    expect(await b.db.vocabulary.count()).toBe(5);
  });

  it('joins snapshots from two devices, neither of which dominates the other', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const b = await device('B', folder);
    for (let i = 1; i <= 4; i++) await a.layer.putSynced('vocabulary', word(`a${i}`, 'from A'));
    for (let i = 1; i <= 4; i++) await b.layer.putSynced('vocabulary', word(`b${i}`, 'from B'));
    await a.engine.syncNow();
    await b.engine.syncNow(); // each has written its own snapshot without having seen the other's data
    expect(filesOf(folder, 'snapshot').length).toBeGreaterThanOrEqual(2);
    for (const path of filesOf(folder, 'batch')) folder.files.delete(path);

    const c = await device('C', folder);
    await c.engine.syncNow();
    expect(await c.db.vocabulary.count()).toBe(8);
  });
});

describe('pruning', () => {
  it('keeps recent batch files, and removes covered ones once they are past the 90-day window', async () => {
    const folder = memoryTransport();
    const clock = { now: Date.now() };
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now); // one clock for writes and the engine
    const a = await device('A', folder, clock);
    await fiveWords(a);
    await a.engine.syncNow();
    expect(filesOf(folder, 'batch')).toHaveLength(1); // young: kept

    clock.now += 100 * DAY;
    for (let i = 6; i <= 9; i++) await a.layer.putSynced('vocabulary', word(`v${i}`, `meaning ${i}`));
    const result = await a.engine.syncNow();
    expect(result.snapshotWritten).toBe(true);
    // The first batch is old and covered by the new snapshot; the second is brand new.
    const batches = filesOf(folder, 'batch');
    expect(batches).toHaveLength(1);
    expect(parseBatchPath(batches[0])?.firstSeq).toBe(6);
    expect(result.pruned).toBeGreaterThanOrEqual(2); // old snapshot + old batch
  });

  it('never deletes another device\'s files', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const b = await device('B', folder);
    await fiveWords(a);
    await a.engine.syncNow();
    const aFiles = new Set(folder.files.keys());
    b.clock.now += 365 * DAY;
    for (let i = 1; i <= 4; i++) await b.layer.putSynced('vocabulary', word(`b${i}`, 'x'));
    await b.engine.syncNow();
    for (const file of aFiles) expect(folder.files.has(file), file).toBe(true);
  });

  it('deletes nothing if the snapshot it just wrote cannot be read back whole', async () => {
    const real = memoryTransport();
    const a = await device('A', real);
    await fiveWords(a);
    await a.engine.syncNow(); // a good snapshot and a batch exist
    const before = new Set(real.files.keys());

    // Reads of new snapshots come back truncated, as a half-synced cloud file would.
    const flaky: SyncTransport = {
      ...real,
      list: () => real.list(),
      write: (p, t) => real.write(p, t),
      remove: (p) => real.remove(p),
      read: async (p) => ((await real.read(p)).length > 0 && parseSnapshotPath(p)?.gen === 2 ? (await real.read(p)).slice(0, 40) : real.read(p)),
    };
    const b = await device('B', flaky);
    a.clock.now += 100 * DAY;
    const a2 = createSyncEngine({ db: a.db, transport: flaky, snapshotEvery: 3, now: () => a.clock.now });
    for (let i = 6; i <= 9; i++) await a.layer.putSynced('vocabulary', word(`v${i}`, `m${i}`));
    await expect(a2.syncNow()).rejects.toThrow(/could not be verified/);
    for (const file of before) expect(real.files.has(file), file).toBe(true);
    void b;
  });
});

describe('bad snapshot files', () => {
  it('skips a half-synced snapshot, retries it, and applies it once complete', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await fiveWords(a);
    await a.engine.syncNow();
    const [path] = filesOf(folder, 'snapshot');
    const full = folder.files.get(path) as string;
    for (const batch of filesOf(folder, 'batch')) folder.files.delete(batch);

    folder.files.set(path, full.slice(0, full.length - 30));
    const b = await device('B', folder);
    const early = await b.engine.syncNow();
    expect(early.retryLater).toBe(1);
    expect(await b.db.vocabulary.count()).toBe(0);

    folder.files.set(path, full);
    expect((await b.engine.syncNow()).eventsApplied).toBe(5);
  });

  it('counts a snapshot from a newer app version instead of applying it', async () => {
    const folder = memoryTransport();
    const b = await device('B', folder);
    folder.files.set('future/snapshot-1-x.json', JSON.stringify({ formatVersion: 99, kind: 'snapshot' }));
    expect((await b.engine.syncNow()).fromNewerVersion).toBe(1);
  });
});
