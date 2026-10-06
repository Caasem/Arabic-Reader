import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistenceService } from './db';
import { db } from './schema';
import { enableSyncCapture, isSyncEnabled } from './syncControl';
import { allSyncedScope, createWriteLayer, deleteSynced, putSynced, updateSynced } from './writeLayer';
import { recordKey } from '../sync/types';

const vocab = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, surfaceForm: id, bookId: 'b1', addedAt: 100, ...extra }) as never;

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(() => vi.restoreAllMocks());

describe('with sync off', () => {
  it('stamps updatedAt and creates no events', async () => {
    await putSynced('vocabulary', vocab('v1'));
    expect(typeof (await db.vocabulary.get('v1'))?.updatedAt).toBe('number');
    expect(await db.syncOutbox.count()).toBe(0);
    expect(await db.recordFrontier.count()).toBe(0);
    expect(await isSyncEnabled()).toBe(false);
  });

  it('deletes plainly and ignores a patch to a missing row', async () => {
    await putSynced('vocabulary', vocab('v1'));
    await deleteSynced('vocabulary', 'v1');
    await updateSynced('vocabulary', 'ghost', { meaning: 'x' });
    expect(await db.vocabulary.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);
  });
});

describe('enableSyncCapture', () => {
  it('seeds one put event per existing row, oldest first, carrying each row\'s own updatedAt', async () => {
    await db.vocabulary.bulkPut([vocab('late', { updatedAt: 3000 }), vocab('early', { updatedAt: 1000 })]);
    await db.highlights.put({ id: 'h1', bookId: 'b1', updatedAt: 2000 } as never);

    const { deviceId, seeded } = await enableSyncCapture('Laptop');
    expect(seeded).toBe(3);

    const events = (await db.syncOutbox.toArray()).sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.deviceId)).toEqual([deviceId, deviceId, deviceId]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events.every((e) => e.op === 'put')).toBe(true);
    const byRecord = Object.fromEntries(events.map((e) => [e.recordId, e.updatedAt]));
    expect(byRecord.early).toBe(1000);
    expect(byRecord.h1).toBe(2000);
    expect(byRecord.late).toBe(3000);
    expect(await db.recordFrontier.count()).toBe(3);
  });

  it('is idempotent', async () => {
    await db.vocabulary.put(vocab('v1', { updatedAt: 5 }));
    const first = await enableSyncCapture();
    const second = await enableSyncCapture();
    expect(second).toEqual({ deviceId: first.deviceId, seeded: 0 });
    expect(await db.syncOutbox.count()).toBe(1);
  });
});

describe('with sync on', () => {
  beforeEach(async () => {
    await enableSyncCapture();
  });

  it('saves the row and its event together, and counts seq and the clock', async () => {
    await putSynced('vocabulary', vocab('v1', { meaning: 'book' }));
    await putSynced('vocabulary', vocab('v1', { meaning: 'a book' }));

    const events = (await db.syncOutbox.toArray()).sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[1].updatedAt).toBeGreaterThan(events[0].updatedAt);
    expect((events[1].payload as { meaning: string }).meaning).toBe('a book');
    expect(events[0].seen).toEqual({}); // only ever its own events

    const row = await db.vocabulary.get('v1');
    expect(row?.updatedAt).toBe(events[1].updatedAt);

    // The second edit supersedes the first in the frontier.
    const frontier = await db.recordFrontier.get(recordKey('vocabulary', 'v1'));
    expect(frontier?.events.map((e) => e.eventId)).toEqual([events[1].eventId]);
    const meta = await db.syncMeta.get('local');
    expect(meta?.applied.prefix[meta.deviceId]).toBe(2);
  });

  it('keeps updatedAt strictly increasing even if the clock goes backwards', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10_000);
    await putSynced('vocabulary', vocab('v1'));
    now.mockReturnValue(5_000);
    await putSynced('vocabulary', vocab('v1'));
    const stamps = (await db.syncOutbox.toArray()).sort((a, b) => a.seq - b.seq).map((e) => e.updatedAt);
    expect(stamps[1]).toBeGreaterThan(stamps[0]);
  });

  it('records a delete as an event and a tombstone, and removes the row', async () => {
    await putSynced('vocabulary', vocab('v1'));
    await deleteSynced('vocabulary', 'v1');
    expect(await db.vocabulary.get('v1')).toBeUndefined();
    const frontier = await db.recordFrontier.get(recordKey('vocabulary', 'v1'));
    expect(frontier?.events).toHaveLength(1);
    expect(frontier?.events[0].op).toBe('delete');
    expect(frontier?.events[0].payload).toMatchObject({ id: 'v1', deleted: true });
  });

  it('does not create an event when deleting a row that does not exist', async () => {
    await deleteSynced('vocabulary', 'ghost');
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('is atomic: if the surrounding transaction fails, neither the row nor its event is saved', async () => {
    await expect(
      db.transaction('rw', allSyncedScope(), async () => {
        await putSynced('vocabulary', vocab('v1'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.vocabulary.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);
    expect(await db.recordFrontier.count()).toBe(0);
    const meta = await db.syncMeta.get('local');
    expect(meta?.applied.prefix[meta.deviceId] ?? 0).toBe(0);
  });

  it('captures through the real repos, including a multi-table book delete', async () => {
    await persistenceService.saveBook({ id: 'b1', title: 'T', format: 'epub', addedAt: 1, sizeBytes: 1 } as never, new Blob(['x']));
    await persistenceService.saveReadingPosition({ bookId: 'b1', cfi: 'c', percent: 0.1, updatedAt: 1 });
    await persistenceService.saveVocabularyItem(vocab('v1'));
    await persistenceService.deleteBook('b1');

    const events = await db.syncOutbox.toArray();
    const summary = events.map((e) => `${e.table}:${e.op}`).sort();
    expect(summary).toEqual(['books:delete', 'books:put', 'positions:delete', 'positions:put', 'vocabulary:put']);
    expect(await db.books.count()).toBe(0);
    expect(await db.bookFiles.count()).toBe(0);
  });

  it('captures every row of a backup import', async () => {
    await persistenceService.importBackup({
      formatVersion: 1,
      exportedAt: 1,
      vocabulary: [vocab('v1'), vocab('v2')],
      wordInstances: [],
      highlights: [{ id: 'h1', bookId: 'b1' } as never],
    });
    expect(await db.syncOutbox.count()).toBe(3);
  });

  it('keeps preferences readable and free of sync fields', async () => {
    const prefs = await persistenceService.getPreferences();
    await persistenceService.savePreferences(prefs);
    expect(await persistenceService.getPreferences()).not.toHaveProperty('updatedAt');
    expect((await db.syncOutbox.toArray()).some((e) => e.table === 'preferences')).toBe(true);
  });
});

describe('change signal', () => {
  it('fires after a captured write, never when sync is off or nothing was captured', async () => {
    let calls = 0;
    const layer = createWriteLayer(db, () => void calls++);

    await layer.putSynced('vocabulary', vocab('v1')); // sync is off in this test
    expect(calls).toBe(0);

    await enableSyncCapture();
    await layer.putSynced('vocabulary', vocab('v1'));
    expect(calls).toBe(1);
    await layer.bulkPutSynced('vocabulary', [vocab('v2'), vocab('v3')]);
    expect(calls).toBe(2); // once per call, not per row
    await layer.deleteSynced('vocabulary', 'v1');
    expect(calls).toBe(3);
    await layer.deleteSynced('vocabulary', 'ghost'); // nothing to delete, nothing captured
    expect(calls).toBe(3);
  });
});
