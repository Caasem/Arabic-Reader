import { readString, writeString } from '../utils/storage';

/** Where the clean reader left off in a book. Kept apart from the epub
 * reader's saved position (which is an epub CFI) so switching modes never
 * corrupts either one. */
export interface CleanPosition {
  chapter: number;
  /** 0-1 scroll fraction within the chapter. */
  scroll: number;
}

const key = (bookId: string) => `arabic-reader:cleanPosition:${bookId}`;

export function loadCleanPosition(bookId: string): CleanPosition {
  try {
    const parsed = JSON.parse(readString(key(bookId)) ?? 'null') as Partial<CleanPosition> | null;
    return {
      chapter: Number.isInteger(parsed?.chapter) && parsed!.chapter! >= 0 ? parsed!.chapter! : 0,
      scroll: typeof parsed?.scroll === 'number' && parsed.scroll >= 0 && parsed.scroll <= 1 ? parsed.scroll : 0,
    };
  } catch {
    return { chapter: 0, scroll: 0 };
  }
}

export function saveCleanPosition(bookId: string, position: CleanPosition): void {
  writeString(key(bookId), JSON.stringify(position));
}
