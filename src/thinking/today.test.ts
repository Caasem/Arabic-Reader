import { describe, expect, it } from 'vitest';
import type { Desk, DeskItem, JournalEntry } from '../studyDesk/types';
import type { ReadingSession } from '../types';
import { onThisDay, sessionSummary, shouldAsk, weekMinutes } from './today';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 12);
const MIN = 60000;

const session = (bookId: string, when: number, minutes: number): ReadingSession => ({
  id: `${bookId}-${when}`,
  bookId,
  bookTitle: `Book ${bookId}`,
  startedAt: when,
  endedAt: when + minutes * MIN,
  activeDurationMs: minutes * MIN,
  wordsRead: 0,
  lookupCount: 0,
  startPercent: 0,
  endPercent: 0,
});

const entry = (when: number, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j${when}`,
  at: when,
  bookId: 'a',
  bookTitle: 'Book a',
  pages: 0,
  minutes: 10,
  text: '',
  createdAt: when,
  updatedAt: when,
  ...extra,
});

const thought = (created: number, extra: Partial<DeskItem> = {}): DeskItem => ({
  id: 't',
  deskId: 'd',
  type: 'line',
  text: '',
  body: 'Intention decides the deed',
  inInbox: false,
  createdAt: created,
  updatedAt: created,
  ...extra,
});

const none = { journal: [], sessions: [], items: [] };

describe('onThisDay', () => {
  it('is empty when nothing was read', () => {
    expect(onThisDay(NOW, none)).toEqual({ year: null, half: null });
  });

  it('sums minutes per book from that day’s sessions and pages from its journal lines', () => {
    const day = at(2025, 10, 12);
    const { year, half } = onThisDay(NOW, {
      ...none,
      sessions: [session('a', day, 20), session('a', day + 3600e3, 18), session('b', day, 7)],
      journal: [entry(day + 7200e3, { pages: 4, text: 'Intention is not the deed' })],
    });
    expect(half).toBeNull();
    expect(year?.books.map((b) => [b.bookId, b.minutes, b.pages])).toEqual([
      ['a', 38, 4],
      ['b', 7, 0],
    ]);
    expect(year?.lines.map((l) => l.text)).toEqual(['Intention is not the deed']);
  });

  it('takes the nearest day within three days either side', () => {
    const { year } = onThisDay(NOW, { ...none, sessions: [session('a', at(2025, 10, 15), 10), session('b', at(2025, 10, 10), 10)] });
    expect(year?.books.map((b) => b.bookId)).toEqual(['b']);
    expect(onThisDay(NOW, { ...none, sessions: [session('a', at(2025, 10, 16), 10)] }).year).toBeNull();
    expect(onThisDay(NOW, { ...none, sessions: [session('a', at(2025, 10, 15), 10)] }).year?.date).toBe(at(2025, 10, 15, 0));
  });

  it('looks at six months ago separately', () => {
    const { year, half } = onThisDay(NOW, { ...none, sessions: [session('a', at(2026, 4, 12), 30)] });
    expect(year).toBeNull();
    expect(half?.period).toBe('half');
    expect(half?.books[0].minutes).toBe(30);
  });

  it('uses the last day of a shorter month', () => {
    const now = at(2026, 8, 31);
    expect(onThisDay(now, { ...none, sessions: [session('a', at(2026, 2, 28), 10)] }).half?.date).toBe(at(2026, 2, 28, 0));
  });

  it('lists threads started that day', () => {
    const day = at(2025, 10, 12);
    const desk = { id: 'th1', kind: 'thread', title: 'Intention', html: '', createdAt: day, updatedAt: day } as Desk;
    const other = { ...desk, id: 'own', kind: 'own' } as Desk;
    expect(onThisDay(NOW, { ...none, desks: [desk, other] }).year?.threads).toEqual([{ id: 'th1', title: 'Intention' }]);
  });

  it('pairs a thought from then with its wording now when it was revised', () => {
    const day = at(2025, 10, 12);
    const revised = thought(day, {
      body: 'Intention is everything',
      versions: [{ at: day, text: 'Intention decides the deed' }],
      review: { due: 0, every: 7, agreed: [], revisedAt: at(2026, 1, 5) },
    });
    const same = thought(day, { id: 'u' });
    const look = onThisDay(NOW, { ...none, items: [revised, same] }).year;
    expect(look?.revised).toHaveLength(1);
    expect(look?.revised[0]).toMatchObject({ then: 'Intention decides the deed', now: 'Intention is everything', revisedAt: at(2026, 1, 5) });
  });

  it('follows a thought through two revisions', () => {
    const day = at(2025, 10, 12);
    const item = thought(day, {
      body: 'third',
      versions: [
        { at: day, text: 'first' },
        { at: at(2026, 1, 1), text: 'second' },
      ],
      review: { due: 0, every: 7, agreed: [], revisedAt: at(2026, 3, 1) },
    });
    const look = onThisDay(NOW, { ...none, items: [item] }).year;
    expect(look?.revised[0]).toMatchObject({ then: 'first', now: 'third', revisedAt: at(2026, 1, 1) });
  });
});

describe('weekMinutes', () => {
  it('adds the last seven days only', () => {
    const list = [session('a', NOW - 60 * MIN, 25), session('b', NOW - 3 * 864e5, 16), session('a', NOW - 9 * 864e5, 50)];
    expect(weekMinutes(list, NOW)).toBe(41);
  });
});

describe('sessionSummary', () => {
  const zero = { pages: 0, minutes: 0, moves: 0, thoughts: 0, questions: 0, threaded: 0 };
  it('leaves out zeros but always says minutes', () => {
    expect(sessionSummary({ pages: 4, minutes: 38, moves: 2, thoughts: 1, questions: 1, threaded: 3 })).toBe(
      '4 pages · 38 minutes · 2 moves · 1 thought · 1 masʾala · 3 added to threads'
    );
    expect(sessionSummary({ ...zero, minutes: 6 })).toBe('6 minutes');
    expect(sessionSummary({ ...zero, minutes: 1, questions: 2, threaded: 1 })).toBe('1 minute · 2 masāʾil · 1 added to a thread');
    expect(sessionSummary(zero)).toBe('under a minute');
  });
});

describe('shouldAsk', () => {
  const made = { moves: 0, thoughts: 0, questions: 0, threaded: 0 };
  it('asks after five minutes or anything made', () => {
    expect(shouldAsk({ minutes: 4, made })).toBe(false);
    expect(shouldAsk({ minutes: 5, made })).toBe(true);
    expect(shouldAsk({ minutes: 0, made: { ...made, threaded: 1 } })).toBe(true);
    expect(shouldAsk({ minutes: 1, made: { ...made, moves: 1 } })).toBe(true);
  });
});
