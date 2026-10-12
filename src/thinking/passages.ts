import { parseCleanLocation } from '../readerCore/location';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';

/**
 * Passages and thoughts as the thinking desk sees desk items (docs/features/thinking-front.md): a passage is a
 * quote or capture with a place on the page; a thought is a note (or a Ḥāshiya line) with words in it.
 */

export interface Place {
  bookId: string;
  location: string;
}

/** Where an item was taken from on the page (its source), else where it sits in the margin. */
export function placeOf(item: DeskItem): Place | null {
  if (item.source?.location) return { bookId: item.source.bookId, location: item.source.location };
  if (item.pin) return { bookId: item.pin.bookId, location: item.pin.location };
  return null;
}

/** A quote or capture with a real place: a box on a PDF page, or a stretch of the quiet reader's text. */
export function isPassage(item: DeskItem): boolean {
  if (item.type !== 'quote' && item.type !== 'capture') return false;
  const loc = item.source?.location;
  const pdf = parsePdfLocation(loc);
  if (pdf) return pdf.w > 0 && pdf.h > 0;
  const clean = parseCleanLocation(loc);
  return !!clean && clean.end > clean.start;
}

/** A thought's words: a margin note keeps them in its body. */
export function thoughtText(item: DeskItem): string {
  return (item.body ?? '').trim() || item.text.trim();
}

export function isThought(item: DeskItem): boolean {
  return (item.type === 'note' || item.type === 'line') && !item.droppedAt && !!thoughtText(item);
}

export const isQuestion = (item: DeskItem): boolean => item.type === 'question';

/** Whether two places on the page meet: a PDF box or level against a box, or two stretches of one chapter. */
export function overlaps(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = parsePdfLocation(a);
  const pb = parsePdfLocation(b);
  if (pa && pb) {
    if (pa.page !== pb.page) return false;
    // A level (a margin note's place) has no height: let it meet a box it sits beside, within a line or so.
    const slack = 0.012;
    return pa.y <= pb.y + pb.h + slack && pb.y <= pa.y + pa.h + slack && (pa.h === 0 || pb.h === 0 || (pa.x <= pb.x + pb.w && pb.x <= pa.x + pa.w));
  }
  const ca = parseCleanLocation(a);
  const cb = parseCleanLocation(b);
  if (ca && cb) return ca.chapter === cb.chapter && ca.start <= cb.end && cb.start <= ca.end;
  return false;
}

/** Does this item sit on (or beside) the passage? Same book, places that meet. */
export function onPassage(item: DeskItem, passage: DeskItem): boolean {
  const p = placeOf(passage);
  if (!p) return false;
  const places = [item.source, item.pin].filter((x): x is NonNullable<typeof x> => !!x?.location);
  return places.some((s) => s.bookId === p.bookId && overlaps(s.location, p.location));
}

/** "Book, p. 62" or "Book, chapter" for a passage. */
export function citeOf(item: DeskItem): string {
  const s = item.source;
  if (!s) return '';
  const pdf = parsePdfLocation(s.location);
  const where = pdf ? `p. ${pdf.page}` : s.chapterLabel;
  return [s.bookTitle, where].filter(Boolean).join(', ');
}

/** The page number of a PDF place, for sorting passages page by page. */
export function pageOf(item: DeskItem): number {
  const pdf = parsePdfLocation(item.source?.location);
  if (pdf) return pdf.page;
  const clean = parseCleanLocation(item.source?.location);
  return clean ? clean.chapter : 0;
}

/** Passages in reading order: page (or chapter), then down the page (or along the text). */
export function readingOrder(a: DeskItem, b: DeskItem): number {
  const pa = parsePdfLocation(a.source?.location);
  const pb = parsePdfLocation(b.source?.location);
  if (pa && pb) return pa.page - pb.page || pa.y - pb.y || pb.x - pa.x;
  const ca = parseCleanLocation(a.source?.location);
  const cb = parseCleanLocation(b.source?.location);
  if (ca && cb) return ca.chapter - cb.chapter || ca.start - cb.start;
  return a.createdAt - b.createdAt;
}

/** "a year ago", "3 days ago", "today". */
export function ago(at: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "12 Oct 2026". */
export function dateLabel(at: number): string {
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** First words of a text, cut at a word. */
export function short(text: string, n = 70): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const at = cut.lastIndexOf(' ');
  return (at > n * 0.5 ? cut.slice(0, at) : cut) + '…';
}
