import { parseCleanLocation } from '../readerCore/location';
import type { DeskItem } from '../studyDesk/types';
import type { ArgItem } from './roles';

/** Room for a chapter's characters, so a place in the book is one number in reading order. */
const CHAPTER_SPAN = 10_000_000;

export const spotOf = (location: string): number | null => {
  const at = parseCleanLocation(location);
  return at ? at.chapter * CHAPTER_SPAN + at.start : null;
};

/** The argument items of one book, as the pure logic sees them. Items without a clean place are left out (no PDF pages yet). */
export function argItemsOf(items: readonly DeskItem[], bookId: string): ArgItem[] {
  const out: ArgItem[] = [];
  for (const i of items) {
    if (!i.argument || i.source?.bookId !== bookId) continue;
    const spot = spotOf(i.argument.pin?.location ?? i.source.location ?? '');
    if (spot == null) continue;
    out.push({ id: i.id, role: i.argument.role, for: i.argument.for, spot, marginOnly: !!i.argument.pin });
  }
  return out;
}
