import type { DeskItem, DeskLink, DeskRel } from '../studyDesk/types';
import { isPassage, readingOrder } from './passages';

/** Muqābala (docs/features/thinking-front.md): two books side by side, passages linked across the gap. */

export const RELATIONS: { id: DeskRel; label: string }[] = [
  { id: 'same', label: 'Same text' },
  { id: 'supports', label: 'Supports' },
  { id: 'differs', label: 'Differs' },
  { id: 'explains', label: 'Explains' },
  { id: 'quotes', label: 'Quotes' },
];
export const relLabel = (rel: DeskRel): string => RELATIONS.find((r) => r.id === rel)?.label ?? rel;

export interface BookChoice {
  bookId: string;
  title: string;
  passages: number;
}

/** Books that have passages on a desk, most passages first. */
export function booksWithPassages(items: DeskItem[]): BookChoice[] {
  const by = new Map<string, BookChoice>();
  for (const i of items) {
    if (!isPassage(i) || !i.source) continue;
    const b = by.get(i.source.bookId) ?? { bookId: i.source.bookId, title: i.source.bookTitle ?? 'A book', passages: 0 };
    b.passages++;
    by.set(i.source.bookId, b);
  }
  return [...by.values()].sort((a, b) => b.passages - a.passages || a.title.localeCompare(b.title));
}

/** A book's passages in reading order. */
export function bookPassages(items: DeskItem[], bookId: string): DeskItem[] {
  return items.filter((i) => isPassage(i) && i.source?.bookId === bookId && !i.droppedAt).sort(readingOrder);
}

/** Links whose two passages are in these two books, each oriented left (in A) to right (in B). */
export function linksAcross(links: DeskLink[], byId: Map<string, DeskItem>, a: string, b: string): { link: DeskLink; left: DeskItem; right: DeskItem }[] {
  const out: { link: DeskLink; left: DeskItem; right: DeskItem }[] = [];
  for (const link of links) {
    const x = byId.get(link.a);
    const y = byId.get(link.b);
    if (!x || !y) continue;
    const xb = x.source?.bookId;
    const yb = y.source?.bookId;
    if (xb === a && yb === b) out.push({ link, left: x, right: y });
    else if (xb === b && yb === a) out.push({ link, left: y, right: x });
  }
  return out;
}

/**
 * Picking passages to link: a first click picks; a click on the other side makes the pair to name; a click on the
 * same side moves the pick; the same passage again lets it go.
 */
export type Pick = { pick: { id: string; side: 'a' | 'b' } | null; pair: { a: string; b: string } | null };

export function pickPassage(state: Pick, id: string, side: 'a' | 'b'): Pick {
  if (!state.pick) return { pick: { id, side }, pair: null };
  if (state.pick.id === id) return { pick: null, pair: null };
  if (state.pick.side === side) return { pick: { id, side }, pair: null };
  return { pick: null, pair: side === 'b' ? { a: state.pick.id, b: id } : { a: id, b: state.pick.id } };
}

/** The wire between two passages across the gap: out of the left pane's edge, a curve, into the right pane's. */
export function wirePath(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.max(24, (x2 - x1) * 0.45);
  return `M ${x1 - 8} ${y1} L ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2} L ${x2 + 8} ${y2}`;
}
