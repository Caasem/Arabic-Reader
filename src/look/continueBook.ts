import type { BookMeta } from '../types';

/** A book counts as finished at about this point (matches the Library filter). */
export const FINISHED_AT = 0.97;

export type ReadingInfoMap = Record<string, { percent: number; lastReadAt?: number }>;

/** The most recently read book that is started but not finished. */
export function pickContinueBook(books: BookMeta[], readingInfo: ReadingInfoMap): BookMeta | undefined {
  let current: BookMeta | undefined;
  let latest = -1;
  for (const book of books) {
    const info = readingInfo[book.id];
    if (!info || info.percent <= 0 || info.percent >= FINISHED_AT) continue;
    if ((info.lastReadAt ?? 0) > latest) {
      latest = info.lastReadAt ?? 0;
      current = book;
    }
  }
  return current;
}
