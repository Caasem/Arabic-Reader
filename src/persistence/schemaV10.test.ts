import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

/** The schema as it shipped before v10, rebuilt here so the upgrade runs against real old data. */
async function seedLegacyDatabase(): Promise<void> {
  const legacy = new Dexie('arabic-reader');
  legacy.version(9).stores({
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
  });
  await legacy.table('books').put({ id: 'b1', title: 'كتاب', addedAt: 1111 });
  await legacy.table('vocabulary').put({ id: 'v1', surfaceForm: 'كتاب', bookId: 'b1', addedAt: 2222 });
  await legacy.table('highlights').put({ id: 'h1', bookId: 'b1', createdAt: 3000, updatedAt: 3500 });
  await legacy.table('bookmarks').put({ id: 'm1', bookId: 'b1', createdAt: 4444 });
  await legacy.table('readingSessions').put({ id: 's1', bookId: 'b1', startedAt: 5000, endedAt: 5600 });
  await legacy.table('pomodoroSessions').put({ id: 'p1', startedAt: 6000, endedAt: 6900 });
  await legacy.table('positions').put({ bookId: 'b1', cfi: 'x', percent: 0.5, updatedAt: 7777 });
  await legacy.table('wordInstances').put({ key: 'b1::k', bookId: 'b1', normalizedForm: 'k' });
  legacy.close();
}

describe('schema v10 upgrade', () => {
  it('backfills updatedAt from each row\'s own timestamps, keeps existing ones, and creates empty sync tables', async () => {
    await seedLegacyDatabase();
    const before = Date.now();
    const { db } = await import('./schema');
    await db.open();

    expect((await db.books.get('b1'))?.updatedAt).toBe(1111);
    expect((await db.vocabulary.get('v1'))?.updatedAt).toBe(2222);
    expect((await db.highlights.get('h1'))?.updatedAt).toBe(3500); // already had one
    expect((await db.bookmarks.get('m1'))?.updatedAt).toBe(4444);
    expect((await db.readingSessions.get('s1'))?.updatedAt).toBe(5600);
    expect((await db.pomodoroSessions.get('p1'))?.updatedAt).toBe(6900);
    expect((await db.positions.get('b1'))?.updatedAt).toBe(7777);

    // Tables that never sync are left alone.
    expect(await db.wordInstances.get('b1::k')).not.toHaveProperty('updatedAt');

    expect(await db.syncOutbox.count()).toBe(0);
    expect(await db.recordFrontier.count()).toBe(0);
    expect(await db.syncMeta.count()).toBe(0);
    expect(db.verno).toBe(12);
    expect(before).toBeLessThanOrEqual(Date.now());
    db.close();
  });
});
