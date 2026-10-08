import { describe, expect, it } from 'vitest';
import type { BookMeta, Highlight, ReadingSession, VocabularyItem } from '../../types';
import { bookStatus, coverColors, formatDuration, relativeDay, shelveBooks, statsByBook, timeLeftMs, topVocabularyBook, weekStrip } from './libraryInsights';
import { addShelf, deleteShelf, forgetBook, renameShelf, toggleBookOnShelf } from './shelves';
import { dayKey } from '../../utils/date';

const book = (id: string, title: string, addedAt: number, author?: string): BookMeta => ({ id, title, author, addedAt, format: 'epub', sizeBytes: 1 });
const session = (bookId: string, minutes: number, start: number, end: number, startedAt = Date.now()): ReadingSession => ({
  id: `${bookId}-${start}`,
  bookId,
  bookTitle: bookId,
  startedAt,
  endedAt: startedAt + minutes * 60_000,
  activeDurationMs: minutes * 60_000,
  wordsRead: 0,
  lookupCount: 0,
  startPercent: start,
  endPercent: end,
});
const highlight = (bookId: string, text: string, note?: string): Highlight => ({
  id: `${bookId}-${text}`,
  bookId,
  bookTitle: bookId,
  cfiRange: '',
  text,
  note,
  color: 'yellow',
  createdAt: 1,
  updatedAt: 1,
});

describe('bookStatus', () => {
  it('splits unread, reading and finished at the library threshold', () => {
    expect(bookStatus(undefined)).toBe('unread');
    expect(bookStatus(0)).toBe('unread');
    expect(bookStatus(0.4)).toBe('reading');
    expect(bookStatus(0.98)).toBe('finished');
  });
});

describe('coverColors', () => {
  it('is stable for a book', () => {
    expect(coverColors('book-1')).toEqual(coverColors('book-1'));
  });
});

describe('timeLeftMs', () => {
  it('projects the remaining time from pace so far', () => {
    // 30 minutes for 10% of the book -> 90% left takes 270 minutes.
    expect(timeLeftMs([session('a', 20, 0, 0.06), session('a', 10, 0.06, 0.1)], 0.1)).toBe(270 * 60_000);
  });
  it('waits for enough reading to estimate', () => {
    expect(timeLeftMs([session('a', 2, 0, 0.05)], 0.05)).toBeUndefined();
    expect(timeLeftMs([session('a', 30, 0.1, 0.11)], 0.11)).toBeUndefined();
    expect(timeLeftMs([session('a', 30, 0, 0.98)], 0.98)).toBeUndefined();
  });
});

describe('formatDuration and relativeDay', () => {
  it('reads naturally', () => {
    expect(formatDuration(30_000)).toBe('under a minute');
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(130 * 60_000)).toBe('2 h 10 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
    const now = new Date(2026, 9, 8, 12).getTime();
    expect(relativeDay(new Date(2026, 9, 8, 1).getTime(), now)).toBe('Today');
    expect(relativeDay(new Date(2026, 9, 7, 23).getTime(), now)).toBe('Yesterday');
    expect(relativeDay(new Date(2026, 9, 5).getTime(), now)).toBe('3 days ago');
    expect(relativeDay(undefined, now)).toBe('—');
  });
});

describe('weekStrip', () => {
  it('ends today and marks active days', () => {
    const now = new Date(2026, 9, 8, 12).getTime();
    const strip = weekStrip(new Set([dayKey(now), dayKey(new Date(2026, 9, 2).getTime())]), now);
    expect(strip).toHaveLength(7);
    expect(strip[6]).toMatchObject({ today: true, active: true });
    expect(strip[0]).toMatchObject({ key: dayKey(new Date(2026, 9, 2).getTime()), active: true });
    expect(strip.filter((d) => d.active)).toHaveLength(2);
  });
});

describe('statsByBook and topVocabularyBook', () => {
  it('counts per book', () => {
    const vocab = [{ bookId: 'a', bookTitle: 'A' }, { bookId: 'b', bookTitle: 'B' }, { bookId: 'b', bookTitle: 'B' }] as VocabularyItem[];
    const stats = statsByBook([highlight('a', 'x')], vocab, [session('a', 10, 0, 0.1)]);
    expect(stats.get('a')).toEqual({ highlights: 1, words: 1, activeMs: 600_000 });
    expect(stats.get('b')).toEqual({ highlights: 0, words: 2, activeMs: 0 });
    expect(topVocabularyBook(vocab)).toEqual({ title: 'B', count: 2 });
    expect(topVocabularyBook([])).toBeUndefined();
  });
});

describe('shelveBooks', () => {
  const books = [book('a', 'مقدمة ابن خلدون', 3, 'ابن خلدون'), book('b', 'كليلة ودمنة', 2, 'ابن المقفع'), book('c', 'البخلاء', 1, 'الجاحظ')];
  const info = { a: { percent: 0.5, lastReadAt: 10 }, b: { percent: 1, lastReadAt: 20 } };
  const base = { query: '', status: 'all' as const, sort: 'added' as const };

  it('searches titles and authors ignoring vowel marks and alef forms', () => {
    expect(shelveBooks(books, info, [], { ...base, query: 'إبن المُقفع' }).map((b) => b.id)).toEqual(['b']);
  });
  it('finds a book by the text of a highlight or its note', () => {
    const hs = [highlight('c', 'الإنسانُ مدنيٌّ بالطبع'), highlight('a', 'x', 'about umran')];
    expect(shelveBooks(books, info, hs, { ...base, query: 'مدني' }).map((b) => b.id)).toEqual(['c']);
    expect(shelveBooks(books, info, hs, { ...base, query: 'umran' }).map((b) => b.id)).toEqual(['a']);
  });
  it('filters by status and shelf', () => {
    expect(shelveBooks(books, info, [], { ...base, status: 'reading' }).map((b) => b.id)).toEqual(['a']);
    expect(shelveBooks(books, info, [], { ...base, status: 'unread' }).map((b) => b.id)).toEqual(['c']);
    expect(shelveBooks(books, info, [], { ...base, onlyIds: new Set(['b', 'c']) }).map((b) => b.id)).toEqual(['b', 'c']);
  });
  it('sorts by last read with never-opened books last', () => {
    expect(shelveBooks(books, info, [], { ...base, sort: 'lastRead' }).map((b) => b.id)).toEqual(['b', 'a', 'c']);
    expect(shelveBooks(books, info, [], { ...base, sort: 'progress' }).map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('shelves', () => {
  it('adds, renames, fills and deletes a shelf', () => {
    const { shelves, shelf } = addShelf([], '  Hadith ');
    expect(shelf?.name).toBe('Hadith');
    expect(addShelf(shelves, 'hadith').shelves).toHaveLength(1);
    expect(addShelf(shelves, '   ').shelves).toHaveLength(1);
    let next = toggleBookOnShelf(shelves, shelf!.id, 'a');
    expect(next[0].bookIds).toEqual(['a']);
    next = renameShelf(next, shelf!.id, 'Ḥadīth');
    expect(next[0].name).toBe('Ḥadīth');
    expect(forgetBook(next, 'a')[0].bookIds).toEqual([]);
    expect(forgetBook(next, 'zzz')).toBe(next);
    expect(toggleBookOnShelf(next, shelf!.id, 'a')[0].bookIds).toEqual([]);
    expect(deleteShelf(next, shelf!.id)).toEqual([]);
  });
});
