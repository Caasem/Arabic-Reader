import { getBlobStore } from '../blobStore';
import type { BlobStore } from '../blobStore';
import { sha256Hex } from '../blobStore/hash';
import { db } from './schema';
import { updateSynced } from './writeLayer';

/**
 * Moves book files from the legacy `bookFiles` table into the BlobStore
 * (docs/specs/data-architecture.md section 6). Runs after the app starts, not
 * inside the schema upgrade, one book at a time, and can be stopped at any
 * point and run again:
 *
 *   put the bytes + reference -> confirm they are there -> point the book at
 *   them (`books.fileHash`) -> only then delete the old row.
 *
 * Any failure leaves the old row where it is; reads fall back to it while the
 * book has no usable `fileHash` (booksRepo.getBookFile).
 */
export interface BookFileMigrationStatus {
  state: 'idle' | 'running' | 'done';
  /** Files still in `bookFiles` when this run started. */
  total: number;
  moved: number;
  /** Files that could not be moved this run; they still work from the old table. */
  failed: number;
}

const IDLE: BookFileMigrationStatus = { state: 'idle', total: 0, moved: 0, failed: 0 };
let status: BookFileMigrationStatus = IDLE;
const listeners = new Set<() => void>();

/** Replaced (never mutated) on each change, so it works as a React snapshot. */
export const bookFileMigrationStatus = (): BookFileMigrationStatus => status;
export function subscribeBookFileMigration(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function setStatus(next: BookFileMigrationStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

export type BookFileOutcome = 'moved' | 'cleaned' | 'failed' | 'skipped';

/**
 * Moves one book's file. Safe to call again after any interruption.
 * 'cleaned': the bytes were already in the store and the book already pointed
 * at them (the run was stopped before the old row went); only the row is removed.
 * 'skipped': a file with no book record to point at; left alone.
 */
export async function migrateBookFile(bookId: string, store: BlobStore = getBlobStore()): Promise<BookFileOutcome> {
  try {
    const row = await db.bookFiles.get(bookId);
    if (!row) return 'skipped';
    const book = await db.books.get(bookId);
    if (!book) return 'skipped';
    if (!(row.data instanceof Blob)) return 'failed';

    const hash = await sha256Hex(row.data);
    const ref = await store.put(row.data, { ns: 'book', owner: bookId, type: row.data.type });
    if (ref.hash !== hash || ref.size !== row.data.size || !(await store.has(hash))) return 'failed';
    const stored = await store.get(hash);
    if (!stored || stored.size !== row.data.size) return 'failed';

    const already = book.fileHash === hash;
    if (!already) await updateSynced('books', bookId, { fileHash: hash });
    // The book may have been deleted or given another file while this ran: only drop the row we copied.
    const after = await db.books.get(bookId);
    if (after?.fileHash !== hash) {
      await store.unpin(hash, 'book', bookId); // the reference this run added is not wanted any more
      return 'failed';
    }
    await db.bookFiles.delete(bookId);
    return already ? 'cleaned' : 'moved';
  } catch (error) {
    console.error(`Book file ${bookId} could not be moved to the BlobStore; it keeps working from the old table.`, error);
    return 'failed';
  }
}

/** Gives books that rest on bytes already in the store (a synced book, an identical import) a reference of their own. */
async function pinSharedFiles(store: BlobStore): Promise<void> {
  for (const book of await db.books.where('fileHash').above('').toArray()) {
    if (book.fileHash) await store.pin(book.fileHash, 'book', book.id);
  }
}

export interface MigrateOptions {
  store?: BlobStore;
  /** Checked between books; return true to stop (the next run picks up the rest). */
  shouldStop?: () => boolean;
}

/**
 * Runs the whole migration, one book at a time. Only one run at a time across
 * tabs; a tab that finds another running does nothing.
 */
export async function migrateBookFiles(options: MigrateOptions = {}): Promise<BookFileMigrationStatus> {
  const run = async (): Promise<BookFileMigrationStatus> => {
    const store = options.store ?? getBlobStore();
    const ids = (await db.bookFiles.toCollection().primaryKeys()) as string[];
    let moved = 0;
    let failed = 0;
    setStatus({ state: 'running', total: ids.length, moved, failed });
    for (const id of ids) {
      if (options.shouldStop?.()) break;
      const outcome = await migrateBookFile(id, store);
      if (outcome === 'failed') failed++;
      else if (outcome !== 'skipped') moved++;
      setStatus({ state: 'running', total: ids.length, moved, failed });
    }
    try {
      await pinSharedFiles(store);
    } catch (error) {
      console.error('Could not record shared book files.', error);
    }
    const done: BookFileMigrationStatus = { state: 'done', total: ids.length, moved, failed };
    setStatus(done);
    return done;
  };

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return run();
  const result = await locks.request('arabic-reader-book-file-migration', { ifAvailable: true }, (lock) => (lock ? run() : null));
  return result ?? status;
}
