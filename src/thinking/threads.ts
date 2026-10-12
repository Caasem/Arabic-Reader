import type { Desk, DeskItem } from '../studyDesk/types';

/** Threads (docs/features/thinking-front.md): desks of kind `thread`, whose members stay on their own desks. */

export const isThread = (desk: Desk): boolean => desk.kind === 'thread';

/** "النية · Everything on intention", or whichever name it has. */
export function threadLabel(desk: Pick<Desk, 'title' | 'titleAr'>): string {
  const ar = desk.titleAr?.trim();
  return ar && ar !== desk.title ? `${ar} · ${desk.title}` : desk.title;
}

/** Its members, in the order they joined; thoughts dropped in Revisit are left out. */
export function threadMembers(threadId: string, items: DeskItem[]): DeskItem[] {
  return items
    .filter((i) => i.threads?.includes(threadId) && !i.droppedAt)
    .sort((a, b) => joinedAt(a, threadId) - joinedAt(b, threadId));
}

/** When an item joined a thread (its creation when the date is missing). */
export const joinedAt = (item: DeskItem, threadId: string): number => item.joined?.[threadId] ?? item.createdAt;

export interface ThreadSummary {
  desk: Desk;
  count: number;
  /** When something last joined (or the thread was made). */
  lastAdded: number;
  /** Books its members come from. */
  books: number;
}

export function summarise(desk: Desk, items: DeskItem[]): ThreadSummary {
  const members = threadMembers(desk.id, items);
  const lastAdded = members.reduce((m, i) => Math.max(m, joinedAt(i, desk.id)), desk.createdAt);
  const books = new Set(members.map((i) => i.source?.bookId).filter(Boolean)).size;
  return { desk, count: members.length, lastAdded, books };
}

/** Every thread, most recently added to first. */
export function threadSummaries(desks: Desk[], items: DeskItem[]): ThreadSummary[] {
  return desks
    .filter(isThread)
    .map((d) => summarise(d, items))
    .sort((a, b) => b.lastAdded - a.lastAdded);
}

/** Threads whose name or question contains the words typed (any order, ignoring case). */
export function filterThreads(list: ThreadSummary[], query: string): ThreadSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = `${s.desk.title} ${s.desk.titleAr ?? ''} ${s.desk.question ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** What a new thread is called from what was typed: Arabic goes to the Arabic name. */
export function namesFromTyped(typed: string, arabic: boolean): { title: string; titleAr?: string } {
  const t = typed.trim();
  return arabic ? { title: t, titleAr: t } : { title: t };
}

/**
 * How many members a thread had at the end of each of the last `months` months (oldest first, this month last):
 * the sparkline on Today.
 */
export function growth(dates: number[], now = Date.now(), months = 13): number[] {
  const ends: number[] = [];
  const d = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
    ends.push(Math.min(end, now + 1));
  }
  return ends.map((end) => dates.filter((t) => t < end).length);
}

export interface BookGroup {
  bookId: string | null;
  bookTitle: string;
  items: DeskItem[];
}

/** Members grouped by the book they came from (books in the order they first joined), your own last. */
export function byBook(members: DeskItem[]): BookGroup[] {
  const groups = new Map<string | null, BookGroup>();
  for (const item of members) {
    const id = item.source?.bookId ?? null;
    const g = groups.get(id) ?? { bookId: id, bookTitle: id ? (item.source?.bookTitle ?? 'A book') : 'Your own', items: [] };
    g.items.push(item);
    groups.set(id, g);
  }
  const all = [...groups.values()];
  return [...all.filter((g) => g.bookId), ...all.filter((g) => !g.bookId)];
}

/** How many threads get a button of their own besides the active one. */
const RECENT = 3;

/** The threads a passage bar offers: the active one first, then the most recently added to, then any it is already in. */
export function threadChoices(list: ThreadSummary[], active: string | null, item: DeskItem): ThreadSummary[] {
  const act = list.find((s) => s.desk.id === active);
  const rest = list.filter((s) => s.desk.id !== active);
  const shown = [...(act ? [act] : []), ...rest.slice(0, RECENT)];
  for (const s of rest.slice(RECENT)) if (item.threads?.includes(s.desk.id)) shown.push(s);
  return shown;
}


/** What joins the active thread the moment it is made: thoughts, masāʾil, and anything given a move. */
export function joinsActiveThread(item: DeskItem): boolean {
  return item.type === 'note' || item.type === 'line' || item.type === 'question' || !!item.move;
}
