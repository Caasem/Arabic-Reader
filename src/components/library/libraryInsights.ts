/**
 * The numbers and orderings the Library shows, as plain functions over data
 * that is already stored (books, reading positions, sessions, highlights,
 * vocabulary). Nothing here reads the database; useLibraryInsights does that.
 */
import { foldForSearch } from '../../browseLibrary/catalog';
import { FINISHED_AT } from '../../look/continueBook';
import type { BookMeta, Highlight, LibrarySort, ReadingSession, VocabularyItem } from '../../types';
import { addDays, dayKey, startOfDay } from '../../utils/date';

export { FINISHED_AT };

export type BookStatus = 'unread' | 'reading' | 'finished';
export type StatusFilter = 'all' | BookStatus;

export interface ReadingInfo {
  percent: number;
  lastReadAt?: number;
  chapterLabel?: string;
}

export function bookStatus(percent: number | undefined): BookStatus {
  const p = percent ?? 0;
  if (p >= FINISHED_AT) return 'finished';
  return p > 0 ? 'reading' : 'unread';
}

/** Cloth colours for books without a cover image: [background, ink]. */
const COVER_COLORS: [string, string][] = [
  ['#2f4b4a', '#e9dcbc'],
  ['#1f3f5f', '#efe2c4'],
  ['#5b2a2a', '#f0dfc0'],
  ['#3b3355', '#e6dcc6'],
  ['#3d5a2a', '#efe5c8'],
  ['#6b5228', '#f3e7cb'],
  ['#7a3f1e', '#f2dfc2'],
  ['#24464f', '#e3dccb'],
  ['#4a3b2a', '#eedfc3'],
  ['#2a3f35', '#e8dfc6'],
];

/** The same book always gets the same cloth. */
export function coverColors(bookId: string): { bg: string; ink: string } {
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) hash = (hash * 31 + bookId.charCodeAt(i)) | 0;
  const [bg, ink] = COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
  return { bg, ink };
}

/**
 * How long the rest of a book should take at this reader's pace in it: time
 * spent so far over ground covered so far. Undefined until there is enough
 * to go on (5 minutes and 2% of the book), or when the book is done.
 */
export function timeLeftMs(sessions: readonly ReadingSession[], percent: number): number | undefined {
  if (percent >= FINISHED_AT) return undefined;
  let active = 0;
  let covered = 0;
  for (const s of sessions) {
    active += s.activeDurationMs;
    covered += Math.max(0, s.endPercent - s.startPercent);
  }
  if (active < 5 * 60_000 || covered < 0.02) return undefined;
  return Math.round((active / covered) * (1 - percent));
}

/** "2 h 10 min", "45 min", "under a minute". */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return 'under a minute';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "Today", "Yesterday", "3 days ago", then a date. */
export function relativeDay(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) return '—';
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export interface WeekDay {
  key: string;
  label: string;
  active: boolean;
  today: boolean;
}

/** The last seven days ending today, for the streak tile. */
export function weekStrip(activeDays: ReadonlySet<string>, now: number = Date.now()): WeekDay[] {
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const t = addDays(now, -i);
    const key = dayKey(t);
    out.push({
      key,
      label: new Date(t).toLocaleDateString(undefined, { weekday: 'narrow' }),
      active: activeDays.has(key),
      today: i === 0,
    });
  }
  return out;
}

export function activeMsOnDay(sessions: readonly ReadingSession[], now: number = Date.now()): number {
  const key = dayKey(now);
  return sessions.reduce((sum, s) => (dayKey(s.startedAt) === key ? sum + s.activeDurationMs : sum), 0);
}

export interface BookStats {
  highlights: number;
  words: number;
  activeMs: number;
}

export function statsByBook(
  highlights: readonly Highlight[],
  vocabulary: readonly VocabularyItem[],
  sessions: readonly ReadingSession[]
): Map<string, BookStats> {
  const map = new Map<string, BookStats>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { highlights: 0, words: 0, activeMs: 0 }));
    return s;
  };
  for (const h of highlights) get(h.bookId).highlights++;
  for (const v of vocabulary) if (v.bookId) get(v.bookId).words++;
  for (const s of sessions) get(s.bookId).activeMs += s.activeDurationMs;
  return map;
}

export interface ShelfQuery {
  query: string;
  status: StatusFilter;
  /** Only these books (a shelf), or every book when undefined. */
  onlyIds?: ReadonlySet<string>;
  sort: LibrarySort;
}

/**
 * Search (title, author, or the text of a highlight in the book, ignoring
 * vowel marks and alef forms), then status and shelf, then order.
 */
export function shelveBooks(
  books: readonly BookMeta[],
  info: Readonly<Record<string, ReadingInfo>>,
  highlights: readonly Highlight[],
  { query, status, onlyIds, sort }: ShelfQuery
): BookMeta[] {
  const q = foldForSearch(query);
  let hitByHighlight: Set<string> | null = null;
  if (q) {
    hitByHighlight = new Set();
    for (const h of highlights) if (foldForSearch(h.text).includes(q) || foldForSearch(h.note ?? '').includes(q)) hitByHighlight.add(h.bookId);
  }
  const list = books.filter((b) => {
    if (onlyIds && !onlyIds.has(b.id)) return false;
    if (status !== 'all' && bookStatus(info[b.id]?.percent) !== status) return false;
    if (!q) return true;
    return foldForSearch(b.title).includes(q) || foldForSearch(b.author ?? '').includes(q) || hitByHighlight!.has(b.id);
  });
  const sorted = [...list];
  if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  else if (sort === 'progress') sorted.sort((a, b) => (info[b.id]?.percent ?? 0) - (info[a.id]?.percent ?? 0));
  else if (sort === 'lastRead') sorted.sort((a, b) => (info[b.id]?.lastReadAt ?? -1) - (info[a.id]?.lastReadAt ?? -1) || b.addedAt - a.addedAt);
  else sorted.sort((a, b) => b.addedAt - a.addedAt);
  return sorted;
}

/** The book most of the reader's saved words came from. */
export function topVocabularyBook(vocabulary: readonly VocabularyItem[]): { title: string; count: number } | undefined {
  const counts = new Map<string, { title: string; count: number }>();
  for (const v of vocabulary) {
    if (!v.bookId) continue;
    const entry = counts.get(v.bookId) ?? { title: v.bookTitle, count: 0 };
    entry.count++;
    counts.set(v.bookId, entry);
  }
  let best: { title: string; count: number } | undefined;
  for (const e of counts.values()) if (!best || e.count > best.count) best = e;
  return best;
}

/** Today's date in the Hijri calendar, in Arabic, when the platform knows it. */
export function hijriDate(now: number = Date.now()): string | undefined {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { day: 'numeric', month: 'long' }).format(now);
  } catch {
    return undefined;
  }
}
