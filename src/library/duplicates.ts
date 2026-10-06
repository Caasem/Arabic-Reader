import type { BookMeta } from '../types';

/**
 * Two devices that each imported the same book (the starter books, or any book
 * added on both) end up with two records after sync, because each import makes
 * its own id. The copy that has no file on this device is just a stub of the
 * other device's book, so it is hidden while a real copy is here.
 *
 * Display only: nothing is deleted. Deleting a stub would be sent to the other
 * device as a delete of ITS real copy.
 *
 * Two books are "the same" when title, author and file size all match.
 */
const sameBookKey = (b: BookMeta): string => `${b.title}\u0000${b.author ?? ''}\u0000${b.sizeBytes}`;

export function hiddenDuplicateIds(books: BookMeta[], fileIds: Set<string> | null): Set<string> {
  const hidden = new Set<string>();
  if (!fileIds) return hidden; // not known yet: hide nothing
  const withFile = new Set(books.filter((b) => fileIds.has(b.id)).map(sameBookKey));
  for (const book of books) {
    if (!fileIds.has(book.id) && withFile.has(sameBookKey(book))) hidden.add(book.id);
  }
  return hidden;
}
