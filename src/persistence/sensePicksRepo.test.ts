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

describe('meaning picks storage', () => {
  it('adds the table on upgrade from v10 without touching existing data, then stores picks per dictionary', async () => {
    await seedV10Database();
    const { db } = await import('./schema');
    const { getSensePicks, setSensePick, clearSensePick } = await import('./sensePicksRepo');
    await db.open();
    expect(await db.vocabulary.get('v1')).toMatchObject({ surfaceForm: 'كتاب' });
    expect(await db.sensePicks.count()).toBe(0);

    await setSensePick({ bookKey: 'b', lemmaKey: 'w', providerId: 'aramorph', senseKey: 's1' });
    await setSensePick({ bookKey: 'b', lemmaKey: 'w', providerId: 'baranov', senseKey: 's2' });
    await setSensePick({ bookKey: 'b', lemmaKey: 'other', providerId: 'aramorph', senseKey: 's9' });
    await setSensePick({ bookKey: 'b2', lemmaKey: 'w', providerId: 'aramorph', senseKey: 's8' });
    expect(await getSensePicks('b', 'w')).toEqual(new Map([['aramorph', 's1'], ['baranov', 's2']]));

    // Picking again in the same dictionary replaces, it does not add.
    await setSensePick({ bookKey: 'b', lemmaKey: 'w', providerId: 'aramorph', senseKey: 's3' });
    expect((await getSensePicks('b', 'w')).get('aramorph')).toBe('s3');
    expect(await db.sensePicks.count()).toBe(4);

    await clearSensePick({ bookKey: 'b', lemmaKey: 'w', providerId: 'aramorph' });
    expect(await getSensePicks('b', 'w')).toEqual(new Map([['baranov', 's2']]));
    expect(await getSensePicks('b2', 'w')).toEqual(new Map([['aramorph', 's8']]));
  });

  it('keeps a lemma key that is a prefix of another from matching it', async () => {
    const { setSensePick, getSensePicks } = await import('./sensePicksRepo');
    await setSensePick({ bookKey: 'bk', lemmaKey: 'abc', providerId: 'p', senseKey: 'x' });
    await setSensePick({ bookKey: 'bk', lemmaKey: 'abcd', providerId: 'p', senseKey: 'y' });
    expect(await getSensePicks('bk', 'abc')).toEqual(new Map([['p', 'x']]));
  });
});
