import type { BookMeta, ReadingPosition } from '../types';
import { db } from './schema';

export async function saveBook(meta: BookMeta, file: Blob): Promise<void> {
  await db.transaction('rw', db.books, db.bookFiles, async () => {
    await db.books.put(meta);
    await db.bookFiles.put({ bookId: meta.id, data: file });
  });
}
export async function getBooks(): Promise<BookMeta[]> {
  return db.books.orderBy('addedAt').reverse().toArray();
}
export async function getBook(id: string): Promise<BookMeta | undefined> {
  return db.books.get(id);
}
export async function getBookFile(id: string): Promise<Blob | undefined> {
  return (await db.bookFiles.get(id))?.data;
}
export async function deleteBook(id: string): Promise<void> {
  await db.transaction('rw', db.books, db.bookFiles, db.positions, async () => {
    await db.books.delete(id);
    await db.bookFiles.delete(id);
    await db.positions.delete(id);
  });
}
export async function updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void> {
  await db.books.update(id, patch);
}

export async function saveReadingPosition(pos: ReadingPosition): Promise<void> {
  await db.positions.put(pos);
}
export async function getReadingPosition(bookId: string): Promise<ReadingPosition | undefined> {
  return db.positions.get(bookId);
}
/** One read for many books; books with no position are absent. */
export async function getReadingPositions(bookIds: string[]): Promise<Map<string, ReadingPosition>> {
  const rows = await db.positions.bulkGet(bookIds);
  const out = new Map<string, ReadingPosition>();
  for (const row of rows) if (row) out.set(row.bookId, row);
  return out;
}

export async function saveBookLocations(bookId: string, data: string, total: number): Promise<void> {
  await db.bookLocations.put({ bookId, data, total });
}
export async function getBookLocations(bookId: string): Promise<{ data: string; total: number } | undefined> {
  const row = await db.bookLocations.get(bookId);
  return row ? { data: row.data, total: row.total } : undefined;
}
