import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BookMeta } from '../types';
import { persistenceService } from './db';
import { db } from './schema';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

const meta = (id: string): BookMeta => ({ id, title: id, format: 'epub', addedAt: 1, sizeBytes: 1 });

describe('books that arrive without their file', () => {
  it('reports which books have a file, and attaching one keeps the book\'s details', async () => {
    await persistenceService.saveBook(meta('mine'), new Blob(['epub']));
    // What a synced book looks like: its details arrived, the file did not.
    await db.books.put({ ...meta('synced'), updatedAt: 5 });

    expect(await persistenceService.getBookFileIds()).toEqual(['mine']);

    await persistenceService.saveBookFile('synced', new Blob(['the file']));
    expect((await persistenceService.getBookFileIds()).sort()).toEqual(['mine', 'synced']);
    expect((await persistenceService.getBook('synced'))?.updatedAt).toBe(5); // untouched
    expect(await (await persistenceService.getBookFile('synced'))?.text()).toBe('the file');
  });
});
