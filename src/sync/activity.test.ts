import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ArabicReaderDB } from '../persistence/schema';
import { createSyncControl } from '../persistence/syncControl';
import { createWriteLayer } from '../persistence/writeLayer';
import { createSyncActivity } from './activity';
import { describeRecord } from './describe';
import { createSyncEngine } from './engine';
import { memoryTransport } from './transport';

let counter = 0;

async function device(name: string, folder: ReturnType<typeof memoryTransport>, clock = { now: Date.now() }) {
  const db = new ArabicReaderDB(`activity-${name}-${counter++}`);
  await db.open();
  await createSyncControl(db).enableSyncCapture(name);
  const layer = createWriteLayer(db);
  return {
    db,
    clock,
    layer,
    engine: createSyncEngine({ db, transport: folder, now: () => clock.now }),
    activity: createSyncActivity({ db, layer, now: () => clock.now }),
  };
}

type Dev = Awaited<ReturnType<typeof device>>;
const word = (id: string, meaning: string) => ({ id, surfaceForm: id, bookId: 'b', addedAt: 1, meaning }) as never;
const meaningOf = async (d: Dev, id: string) => ((await d.db.vocabulary.get(id)) as { meaning?: string } | undefined)?.meaning;

/** Both devices edit one word at the same time, then sync until they agree. */
async function concurrentEdit() {
  const folder = memoryTransport();
  const a = await device('A', folder);
  const b = await device('B', folder);
  await a.layer.putSynced('vocabulary', word('v1', 'seed'));
  await a.engine.syncNow();
  await b.engine.syncNow();
  await a.layer.putSynced('vocabulary', word('v1', 'from A'));
  await b.layer.putSynced('vocabulary', word('v1', 'from B'));
  for (const d of [a, b, a, b]) await d.engine.syncNow();
  return { folder, a, b };
}

describe('listing what sync overwrote', () => {
  it('shows both versions of an overwritten edit in plain terms', async () => {
    const { a } = await concurrentEdit();
    const items = await a.activity.listActivity();
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.tableLabel).toBe('Word');
    expect(item.kept.title).toBe('v1');
    expect([item.kept.detail, item.other.detail].sort()).toEqual(['from A', 'from B']);
    expect(item.kept.detail).toBe(await meaningOf(a, 'v1'));
    expect(item.changedSince).toBe(false);
  });

  it('drops an entry once its undo window has passed', async () => {
    const { a } = await concurrentEdit();
    expect(await a.activity.listActivity()).toHaveLength(1);
    a.clock.now += 91 * 24 * 60 * 60 * 1000;
    expect(await a.activity.listActivity()).toHaveLength(0);
    expect((await a.activity.undo((await a.db.activityLog.toArray())[0].id)).status).toBe('gone');
  });
});

describe('undo', () => {
  it('restores the version that lost, as a new edit that reaches the other device', async () => {
    const { folder, a, b } = await concurrentEdit();
    const [item] = await a.activity.listActivity();
    const winner = await meaningOf(a, 'v1');
    const loser = winner === 'from A' ? 'from B' : 'from A';

    expect(await a.activity.undo(item.id)).toEqual({ status: 'undone' });
    expect(await meaningOf(a, 'v1')).toBe(loser);
    expect(await a.activity.listActivity()).toHaveLength(0);

    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await meaningOf(b, 'v1')).toBe(loser);
    // History was not rewritten: the undo is one more event in A's log.
    expect([...folder.files.keys()].filter((f) => f.includes('/batch-')).length).toBeGreaterThanOrEqual(3);
  });

  it('asks first when the record has changed again since the overwrite', async () => {
    const { a, b } = await concurrentEdit();
    const [item] = await a.activity.listActivity();
    await b.layer.putSynced('vocabulary', word('v1', 'newer edit on B'));
    await b.engine.syncNow();
    await a.engine.syncNow(); // A now holds a later edit than the one the entry was about

    const now = (await a.activity.listActivity())[0];
    expect(now.changedSince).toBe(true);
    expect(await a.activity.undo(item.id)).toEqual({ status: 'changed-since' });
    expect(await meaningOf(a, 'v1')).toBe('newer edit on B'); // nothing was touched

    expect(await a.activity.undo(item.id, { force: true })).toEqual({ status: 'undone' });
    expect(['from A', 'from B']).toContain(await meaningOf(a, 'v1'));
  });

  it('brings back a record that was deleted since, when forced', async () => {
    const { a } = await concurrentEdit();
    const [item] = await a.activity.listActivity();
    await a.layer.deleteSynced('vocabulary', 'v1');
    expect(await a.activity.undo(item.id)).toEqual({ status: 'changed-since' });
    await a.activity.undo(item.id, { force: true });
    expect(await a.db.vocabulary.get('v1')).toBeDefined();
  });

  it('is gone for an entry that does not exist', async () => {
    const { a } = await concurrentEdit();
    expect(await a.activity.undo('nope')).toEqual({ status: 'gone' });
  });
});

async function deleteVersusEdit() {
  const folder = memoryTransport();
  const a = await device('A', folder);
  const b = await device('B', folder);
  await a.layer.putSynced('vocabulary', word('v1', 'seed'));
  await a.engine.syncNow();
  await b.engine.syncNow();
  await a.layer.deleteSynced('vocabulary', 'v1');
  await b.layer.putSynced('vocabulary', word('v1', 'edited on B'));
  for (const d of [a, b, a, b]) await d.engine.syncNow();
  return { a, b };
}

describe('conflicts', () => {
  it('lists a delete-versus-edit conflict with the edit that is still visible', async () => {
    const { a, b } = await deleteVersusEdit();
    for (const d of [a, b]) {
      const conflicts = await d.activity.listConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].edit).toMatchObject({ title: 'v1', detail: 'edited on B' });
    }
  });

  it('keeping the edit resolves it on both devices', async () => {
    const { a, b } = await deleteVersusEdit();
    const [conflict] = await a.activity.listConflicts();
    expect(await a.activity.resolveConflict(conflict.key, 'keep-edit')).toEqual({ status: 'undone' });
    expect(await a.activity.listConflicts()).toHaveLength(0);
    for (const d of [a, b, a]) await d.engine.syncNow();
    expect(await meaningOf(b, 'v1')).toBe('edited on B');
    expect(await b.activity.listConflicts()).toHaveLength(0);
    expect(await a.db.vocabulary.count()).toBe(1);
  });

  it('deleting resolves it on both devices, and the word stays gone', async () => {
    const { a, b } = await deleteVersusEdit();
    const [conflict] = await b.activity.listConflicts();
    await b.activity.resolveConflict(conflict.key, 'delete');
    for (const d of [b, a, b, a]) await d.engine.syncNow();
    expect(await a.db.vocabulary.count()).toBe(0);
    expect(await b.db.vocabulary.count()).toBe(0);
    expect(await a.activity.listConflicts()).toHaveLength(0);
    expect(await b.activity.listConflicts()).toHaveLength(0);
  });

  it('is gone for a conflict that is already resolved', async () => {
    const { a } = await deleteVersusEdit();
    const [conflict] = await a.activity.listConflicts();
    await a.activity.resolveConflict(conflict.key, 'keep-edit');
    expect(await a.activity.resolveConflict(conflict.key, 'delete')).toEqual({ status: 'gone' });
  });
});

describe('describeRecord', () => {
  it('summarises each kind of record, and copes with odd payloads', () => {
    expect(describeRecord('vocabulary', { surfaceForm: 'كتاب', meaning: 'book' })).toEqual({ title: 'كتاب', detail: 'book' });
    expect(describeRecord('highlights', { text: 'a line', note: 'mine' })).toEqual({ title: 'a line', detail: 'Note: mine' });
    expect(describeRecord('positions', { percent: 0.427, chapterLabel: 'Ch 3' })).toEqual({
      title: 'Where you stopped reading',
      detail: '43% · Ch 3',
    });
    expect(describeRecord('books', { title: 'T', author: 'A' })).toEqual({ title: 'T', detail: 'A' });
    expect(describeRecord('vocabulary', null).title).toBe('A word');
    expect(describeRecord('mystery', undefined).title).toBe('A change');
    expect(describeRecord('vocabulary', { surfaceForm: 'x', meaning: 'y'.repeat(300) }).detail?.length).toBeLessThanOrEqual(90);
  });
});

describe('identical changes', () => {
  it('records nothing when two devices made the same change, and still records a real difference', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const b = await device('B', folder);
    // The same starter book on both devices: identical but for when each copy was made.
    await a.layer.putSynced('books', { id: 'starter-x', title: 'T', format: 'epub', addedAt: 1, sizeBytes: 5 } as never);
    await b.layer.putSynced('books', { id: 'starter-x', title: 'T', format: 'epub', addedAt: 99, sizeBytes: 5 } as never);
    for (const d of [a, b, a, b]) await d.engine.syncNow();
    expect(await a.db.books.count()).toBe(1);
    expect(await a.activity.listActivity()).toHaveLength(0);
    expect(await b.activity.listActivity()).toHaveLength(0);

    await a.layer.putSynced('books', { id: 'starter-x', title: 'T (A)', format: 'epub', addedAt: 1, sizeBytes: 5 } as never);
    await b.layer.putSynced('books', { id: 'starter-x', title: 'T (B)', format: 'epub', addedAt: 1, sizeBytes: 5 } as never);
    for (const d of [a, b, a, b]) await d.engine.syncNow();
    expect(await a.activity.listActivity()).toHaveLength(1);
  });
});

describe('resolutions name what they supersede', () => {
  it('clears the record\'s history even when the local clock does not cover it', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const now = Date.now();
    const payload = { id: 'w', surfaceForm: 'w', bookId: 'b', addedAt: 1, updatedAt: now, meaning: 'edited' };
    const event = (eventId: string, deviceId: string, op: 'put' | 'delete') => ({
      eventId, deviceId, seq: 1, table: 'vocabulary', recordId: 'w', op, payload: op === 'put' ? payload : { id: 'w', deleted: true },
      updatedAt: now, seen: {},
    });
    // History this device never "applied" through the engine, so its clock knows nothing of it.
    const key = 'vocabulary\u0000w';
    await a.db.vocabulary.put(payload as never);
    await a.db.recordFrontier.put({ key, events: [event('P', 'devB', 'put'), event('D', 'devC', 'delete')] });
    await a.db.syncConflicts.put({ key, table: 'vocabulary', recordId: 'w', detectedAt: now, eventIds: ['P', 'D'] });

    await a.activity.resolveConflict(key, 'keep-edit');
    const frontier = (await a.db.recordFrontier.get(key))?.events ?? [];
    expect(frontier).toHaveLength(1);
    expect(frontier[0].resolves).toEqual(expect.arrayContaining(['P', 'D']));
  });
});
