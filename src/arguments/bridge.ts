import { parseCleanLocation } from '../readerCore/location';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';
import type { ArgItem } from './roles';

/** Room for a chapter's characters, so a place in the book is one number in reading order. */
const CHAPTER_SPAN = 10_000_000;

/** A place as one number in reading order: a clean place by chapter then offset, a PDF region by page then height on the page. */
export const spotOf = (location: string): number | null => {
  const at = parseCleanLocation(location);
  if (at) return at.chapter * CHAPTER_SPAN + at.start;
  const pdf = parsePdfLocation(location);
  return pdf ? pdf.page * CHAPTER_SPAN + Math.round(pdf.y * 1_000_000) : null;
};

/** The book an item belongs to: where its words are, or the margin it sits in. */
export const bookOf = (i: DeskItem): string | undefined => i.source?.bookId ?? i.pin?.bookId;

/** The argument items of one book, as the pure logic sees them (clean text and PDF pages). */
export function argItemsOf(items: readonly DeskItem[], bookId: string): ArgItem[] {
  const out: ArgItem[] = [];
  for (const i of items) {
    if (!i.argument || bookOf(i) !== bookId) continue;
    const spot = spotOf(i.source?.location ?? i.pin?.location ?? '');
    if (spot == null) continue;
    out.push({ id: i.id, role: i.argument.role, for: i.argument.for, spot, marginOnly: !i.source?.location });
  }
  return out;
}

export type SheetScope = 'chapter' | 'book' | 'all';

/** Room for a whole book's places, so items from several books order by book, then place. */
const BOOK_SPAN = 1e12;

/**
 * The items a sheet shows: the chapter, the book, or every book (the free scope, where an item's book comes from the item).
 * Items of other books keep their own places, shifted by their book's turn in the list, so the sheet lays them out together.
 */
export function argItemsFor(items: readonly DeskItem[], scope: SheetScope, bookId: string, chapter: number | null): ArgItem[] {
  if (scope !== 'all') {
    const own = argItemsOf(items, bookId);
    if (scope === 'book') return own;
    return own.filter((n) => chapter != null && Math.floor(n.spot / CHAPTER_SPAN) === chapter);
  }
  const books = [...new Set(items.filter((i) => i.argument).map(bookOf).filter((b): b is string => !!b))].sort((x, y) => (x === bookId ? -1 : y === bookId ? 1 : x.localeCompare(y)));
  return books.flatMap((b, k) => argItemsOf(items, b).map((n) => ({ ...n, spot: n.spot + k * BOOK_SPAN })));
}
