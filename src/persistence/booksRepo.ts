import { getBlobStore } from '../blobStore';
import type { BookMeta, ReadingPosition } from '../types';
import { db } from './schema';
import { deleteSynced, putSynced, syncScope, updateSynced } from './writeLayer';

/**
 * Book files live in the BlobStore (namespace `book`, owner = book id) and the
 * book's row names them by `fileHash`. A book whose file has not been moved yet
 * (schema v13, bookFileMigration.ts) still has its file in `bookFiles`, so every
 * read falls back to that table until the migration has run.
 */
const NS = 'book';
const blobs = getBlobStore;

export async function saveBook(meta: BookMeta, file: Blob): Promise<void> {
  const previous = (await db.books.get(meta.id))?.fileHash;
  const { hash } = await blobs().put(file, { ns: NS, owner: meta.id, type: file.type });
  try {
    await db.transaction('rw', [db.bookFiles, ...syncScope('books')], async () => {
      await putSynced('books', { ...meta, fileHash: hash });
      await db.bookFiles.delete(meta.id);
    });
  } catch (error) {
    if (previous !== hash) await blobs().unpin(hash, NS, meta.id).catch(() => undefined);
    throw error;
  }
  if (previous && previous !== hash) await blobs().unpin(previous, NS, meta.id);
}
export async function getBooks(): Promise<BookMeta[]> {
  return db.books.orderBy('addedAt').reverse().toArray();
}
export async function getBook(id: string): Promise<BookMeta | undefined> {
  return db.books.get(id);
}
/** The book that has this file, if any (the file's SHA-256, lowercase hex). */
export async function getBookByFileHash(hash: string): Promise<BookMeta | undefined> {
  return db.books.where('fileHash').equals(hash).first();
}
export async function getBookFile(id: string): Promise<Blob | undefined> {
  const hash = (await db.books.get(id))?.fileHash;
  const file = hash ? await blobs().get(hash) : undefined;
  return file ?? (await db.bookFiles.get(id))?.data;
}
/** Ids of the books whose file is on this device (a synced book may arrive without one). */
export async function getBookFileIds(): Promise<string[]> {
  const ids = new Set((await db.bookFiles.toCollection().primaryKeys()) as string[]);
  const { hashed, hashes } = await db.transaction('r', db.books, async () => {
    const query = () => db.books.where('fileHash').above('');
    return { hashed: (await query().primaryKeys()) as string[], hashes: (await query().keys()) as string[] };
  });
  const present = new Map<string, boolean>();
  for (const [i, id] of hashed.entries()) {
    const hash = hashes[i];
    if (!present.has(hash)) present.set(hash, await blobs().has(hash));
    if (present.get(hash)) ids.add(id);
  }
  return [...ids];
}
/** Attach (or replace) a book's file. The book's own details are kept. */
export async function saveBookFile(id: string, file: Blob): Promise<void> {
  const book = await db.books.get(id);
  if (!book) {
    // No record to point at the file: keep it where it can still be found.
    await db.bookFiles.put({ bookId: id, data: file });
    return;
  }
  const { hash } = await blobs().put(file, { ns: NS, owner: id, type: file.type });
  try {
    await db.transaction('rw', [db.bookFiles, ...syncScope('books')], async () => {
      if (book.fileHash !== hash) await updateSynced('books', id, { fileHash: hash });
      await db.bookFiles.delete(id);
    });
  } catch (error) {
    if (book.fileHash !== hash) await blobs().unpin(hash, NS, id).catch(() => undefined);
    throw error;
  }
  if (book.fileHash && book.fileHash !== hash) await blobs().unpin(book.fileHash, NS, book.id);
}
/**
 * Drops a book's file from this device and keeps the book: its record, notes and progress stay, and the card
 * offers "Add file". The record keeps its `fileHash`, so adding the same file back just works. If another book
 * rests on identical bytes they stay (and this book still opens from them).
 */
export async function removeBookFile(id: string): Promise<void> {
  const hash = (await db.books.get(id))?.fileHash;
  await db.bookFiles.delete(id);
  if (hash) await blobs().unpin(hash, NS, id);
}
export async function deleteBook(id: string): Promise<void> {
  const hash = (await db.books.get(id))?.fileHash;
  await db.transaction('rw', [db.bookFiles, ...syncScope('books', 'positions')], async () => {
    await deleteSynced('books', id);
    await db.bookFiles.delete(id);
    await deleteSynced('positions', id);
  });
  if (!hash) return;
  // A book that arrived by sync, or an identical import, may rest on these bytes without a reference of its own yet.
  for (const other of await db.books.where('fileHash').equals(hash).primaryKeys()) await blobs().pin(hash, NS, other as string);
  await blobs().unpin(hash, NS, id);
}
export async function updateBookMeta(id: string, patch: Partial<BookMeta>): Promise<void> {
  await updateSynced('books', id, patch);
}

export async function saveReadingPosition(pos: ReadingPosition): Promise<void> {
  await putSynced('positions', pos);
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
