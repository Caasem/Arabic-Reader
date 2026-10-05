import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

/** The schema as it shipped before v11, so the upgrade runs against a real old database. */
async function seedV10Database(): Promise<void> {
  const legacy = new Dexie('arabic-reader');
  legacy.version(10).stores({
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
  });
  await legacy.table('vocabulary').put({ id: 'v1', surfaceForm: 'كتاب', bookId: 'b1', addedAt: 2222, updatedAt: 2222 });
  legacy.close();
}

const base = { bookKey: 'b', lemmaKey: 'w', providerId: 'aramorph', source: 'entry' as const };

describe('saved-entry storage', () => {
  it('adds the table on upgrade from v10 without touching existing data, then stores one row per saved entry', async () => {
    await seedV10Database();
    const { db } = await import('./schema');
    const { getSensePicks, setSensePick, clearSensePick } = await import('./sensePicksRepo');
    await db.open();
    expect(await db.vocabulary.get('v1')).toMatchObject({ surfaceForm: 'كتاب' });
    expect(await db.sensePicks.count()).toBe(0);

    await setSensePick({ ...base, entryKey: 'e1' });
    await setSensePick({ ...base, entryKey: 'e2' });
    await setSensePick({ ...base, providerId: 'baranov', entryKey: 'e1' });
    await setSensePick({ ...base, lemmaKey: 'other', entryKey: 'e9' });
    await setSensePick({ ...base, bookKey: 'b2', entryKey: 'e8' });
    const rows = await getSensePicks('b', 'w');
    expect(rows.map((r) => `${r.providerId}:${r.entryKey}`).sort()).toEqual(['aramorph:e1', 'aramorph:e2', 'baranov:e1']);

    await clearSensePick({ ...base, entryKey: 'e1' });
    expect((await getSensePicks('b', 'w')).map((r) => `${r.providerId}:${r.entryKey}`).sort()).toEqual(['aramorph:e2', 'baranov:e1']);
    expect(await getSensePicks('b2', 'w')).toHaveLength(1);
  });

  it('saving the same entry again replaces it, and a finer save adds the meaning', async () => {
    const { getSensePicks, setSensePick } = await import('./sensePicksRepo');
    await setSensePick({ ...base, bookKey: 'rep', entryKey: 'e1' });
    await setSensePick({ ...base, bookKey: 'rep', entryKey: 'e1', source: 'selection', senseKey: 's9' });
    const rows = await getSensePicks('rep', 'w');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'selection', senseKey: 's9' });
    await setSensePick({ ...base, bookKey: 'rep', entryKey: 'e1', senseKey: null });
    expect((await getSensePicks('rep', 'w'))[0].senseKey).toBeUndefined();
  });

  it('removing the saved word clears every pick for it and only it', async () => {
    const { getSensePicks, setSensePick, clearWordPicks } = await import('./sensePicksRepo');
    await setSensePick({ ...base, bookKey: 'cw', entryKey: 'e1' });
    await setSensePick({ ...base, bookKey: 'cw', providerId: 'baranov', entryKey: 'e2' });
    await setSensePick({ ...base, bookKey: 'cw', lemmaKey: 'keep', entryKey: 'e3' });
    await clearWordPicks('cw', 'w');
    expect(await getSensePicks('cw', 'w')).toEqual([]);
    expect(await getSensePicks('cw', 'keep')).toHaveLength(1);
  });

  it('does not let a book or word key that is a prefix of another match it', async () => {
    const { setSensePick, getSensePicks } = await import('./sensePicksRepo');
    await setSensePick({ ...base, bookKey: 'bk', lemmaKey: 'abc', entryKey: 'x' });
    await setSensePick({ ...base, bookKey: 'bk', lemmaKey: 'abcd', entryKey: 'y' });
    expect((await getSensePicks('bk', 'abc')).map((r) => r.entryKey)).toEqual(['x']);
  });
});
