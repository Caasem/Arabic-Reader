import type { Desk, DeskItem, JournalEntry } from '../studyDesk/types';
import type { ReadingSession } from '../types';
import { isThought, thoughtText } from './passages';
import { history } from './revisit';

/**
 * Today (docs/features/thinking-front.md): what was read a year ago and six months ago, this week's minutes, and the
 * words of the closing sheet. Pure; the panel and the sheet only draw what comes out of here.
 */

const DAY = 864e5;

export const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const minutesOf = (ms: number): number => Math.round(ms / 60000);

export interface DayBook {
  bookId: string;
  title: string;
  minutes: number;
  /** PDF pages seen, from the journal lines of that day (0 when none). */
  pages: number;
}

/** A thought written on that day and revised since. */
export interface RevisedThought {
  item: DeskItem;
  /** Its wording at the time. */
  then: string;
  /** Its wording now. */
  now: string;
  /** When it was revised (the first change after that day). */
  revisedAt: number;
}

export interface DayLook {
  period: 'year' | 'half';
  /** The day looked at (its midnight), which may be a few days off the exact one. */
  date: number;
  books: DayBook[];
  /** That day's closing lines (journal lines with words). */
  lines: JournalEntry[];
  /** Threads started that day. */
  threads: { id: string; title: string }[];
  revised: RevisedThought[];
}

export interface DayData {
  journal: JournalEntry[];
  sessions: ReadingSession[];
  items: DeskItem[];
  /** For the threads started that day; without it none are listed. */
  desks?: Desk[];
}

/** The same calendar day `months` months back (the last day of a shorter month: 31 August → 28 February). */
function monthsBack(now: number, months: number): number {
  const d = new Date(now);
  const first = new Date(d.getFullYear(), d.getMonth() - months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last)).getTime();
}

/** Days from the exact one to try when nothing happened on it, nearest first (three either side). */
const OFFSETS = [0, -1, 1, -2, 2, -3, 3];

function lookAt(period: 'year' | 'half', day: number, data: DayData): DayLook | null {
  // Midnights are found by calendar, not by adding 24 hours, so a clock change does not move the day.
  const d = new Date(day);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const within = (t: number) => t >= day && t < to;

  const books = new Map<string, DayBook>();
  const book = (bookId: string, title: string) => {
    const b = books.get(bookId) ?? { bookId, title, minutes: 0, pages: 0 };
    if (title && !b.title) b.title = title;
    books.set(bookId, b);
    return b;
  };
  const ms = new Map<string, number>();
  for (const s of data.sessions) {
    if (!within(s.startedAt)) continue;
    ms.set(s.bookId, (ms.get(s.bookId) ?? 0) + s.activeDurationMs);
    book(s.bookId, s.bookTitle);
  }
  for (const [id, total] of ms) book(id, '').minutes = minutesOf(total);
  const onDay = data.journal.filter((j) => within(j.at));
  for (const j of onDay) book(j.bookId, j.bookTitle ?? '').pages += j.pages;

  const lines = onDay.filter((j) => j.text.trim()).sort((a, b) => a.at - b.at);
  const threads = (data.desks ?? [])
    .filter((d) => d.kind === 'thread' && within(d.createdAt))
    .map((d) => ({ id: d.id, title: d.title }));

  const revised: RevisedThought[] = [];
  for (const item of data.items) {
    if (!within(item.createdAt) || !item.versions?.length || !isThought(item)) continue;
    // Every wording, oldest first, each with when it was written; the one in force at the end of that day is "then".
    const words = [...item.versions, { at: history(item)[0].at, text: thoughtText(item) }];
    let at = 0;
    for (let i = 0; i < words.length; i++) if (words[i].at < to) at = i;
    const next = words[at + 1];
    if (!next || words[at].text === thoughtText(item)) continue;
    revised.push({ item, then: words[at].text, now: thoughtText(item), revisedAt: next.at });
  }
  revised.sort((a, b) => a.revisedAt - b.revisedAt);

  const list = [...books.values()].filter((b) => b.minutes > 0 || b.pages > 0).sort((a, b) => b.minutes - a.minutes);
  if (!list.length && !lines.length && !threads.length && !revised.length) return null;
  return { period, date: day, books: list, lines, threads, revised };
}

/** The nearest day to `target` (within three days either side) that has anything to say. */
function nearest(period: 'year' | 'half', target: number, data: DayData): DayLook | null {
  for (const off of OFFSETS) {
    const t = new Date(target);
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + off).getTime();
    const look = lookAt(period, day, data);
    if (look) return look;
  }
  return null;
}

/** What was read, closed and started a year ago and six months ago; null for a period with nothing. */
export function onThisDay(now: number, data: DayData): { year: DayLook | null; half: DayLook | null } {
  return {
    year: nearest('year', monthsBack(now, 12), data),
    half: nearest('half', monthsBack(now, 6), data),
  };
}

/** Minutes read in the last seven days. */
export function weekMinutes(sessions: ReadingSession[], now: number): number {
  const since = now - 7 * DAY;
  return minutesOf(sessions.filter((s) => s.startedAt >= since && s.startedAt <= now).reduce((sum, s) => sum + s.activeDurationMs, 0));
}

export interface Made {
  moves: number;
  thoughts: number;
  questions: number;
  threaded: number;
}

export interface SessionNumbers extends Made {
  pages: number;
  minutes: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "4 pages · 38 minutes · 2 moves · 1 thought · 1 masʾala · 3 added to threads": zeros left out, minutes always. */
export function sessionSummary(s: SessionNumbers): string {
  const parts: string[] = [];
  if (s.pages > 0) parts.push(plural(s.pages, 'page', 'pages'));
  parts.push(s.minutes > 0 ? plural(s.minutes, 'minute', 'minutes') : 'under a minute');
  if (s.moves > 0) parts.push(plural(s.moves, 'move', 'moves'));
  if (s.thoughts > 0) parts.push(plural(s.thoughts, 'thought', 'thoughts'));
  if (s.questions > 0) parts.push(plural(s.questions, 'masʾala', 'masāʾil'));
  if (s.threaded > 0) parts.push(`${s.threaded} added to ${s.threaded === 1 ? 'a thread' : 'threads'}`);
  return parts.join(' · ');
}

export const madeTotal = (m: Made): number => m.moves + m.thoughts + m.questions + m.threaded;

/** Worth a question: five minutes or more, or anything made. */
export function shouldAsk(s: { minutes: number; made: Made }): boolean {
  return s.minutes >= 5 || madeTotal(s.made) > 0;
}
