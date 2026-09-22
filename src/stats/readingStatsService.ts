/**
 * Every number the Reading Dashboard shows, derived from existing tables
 * (`readingSessions`, `vocabulary`, `wordInstances`) so there's one
 * definition of "reading time" or "known word".
 */
import { persistenceService } from '../persistence';
import { vocabularyService } from '../vocabulary';
import type { ReadingSession, VocabularyItem } from '../types';
import { addDays, dayKey, daysBetween, parseDayKey, startOfDay } from '../utils/date';

export { dayKey } from '../utils/date';

export type TimeRange = 'today' | 'week' | 'month' | '90d' | 'all';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  '90d': '90 days',
  all: 'All time',
};

/** Calendar-day bounds (inclusive of today) for a range filter. */
export function rangeToBounds(range: TimeRange, now: number = Date.now()): { since?: number; until?: number } {
  switch (range) {
    case 'today':
      return { since: startOfDay(now) };
    case 'week':
      return { since: addDays(now, -6) };
    case 'month':
      return { since: addDays(now, -29) };
    case '90d':
      return { since: addDays(now, -89) };
    case 'all':
      return {};
  }
}

export interface DayActivity {
  date: string; // dayKey
  activeDurationMs: number;
  wordsRead: number;
  lookupCount: number;
  sessions: number;
}

/** The session log grouped by day, memoized until a new session is saved. */
let dailyActivityCache: Map<string, DayActivity> | null = null;

export function invalidateStatsCache(): void {
  dailyActivityCache = null;
}

async function getDailyActivityMap(): Promise<Map<string, DayActivity>> {
  if (dailyActivityCache) return dailyActivityCache;
  const sessions = await persistenceService.getReadingSessions();
  const map = new Map<string, DayActivity>();
  for (const s of sessions) {
    const key = dayKey(s.startedAt);
    const day = map.get(key);
    if (day) {
      day.activeDurationMs += s.activeDurationMs;
      day.wordsRead += s.wordsRead;
      day.lookupCount += s.lookupCount;
      day.sessions += 1;
    } else {
      map.set(key, { date: key, activeDurationMs: s.activeDurationMs, wordsRead: s.wordsRead, lookupCount: s.lookupCount, sessions: 1 });
    }
  }
  dailyActivityCache = map;
  return map;
}

/** Every day with at least one session, most recent first. */
export async function getDailyActivity(): Promise<DayActivity[]> {
  const map = await getDailyActivityMap();
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface StreakInfo {
  current: number;
  longest: number;
}

/** Current streak = consecutive active days ending today or yesterday (an
 * unfinished today doesn't break it); longest = best run anywhere. Uses
 * calendar-day arithmetic so DST changes never split a run. */
export function computeStreak(activeDays: ReadonlySet<string>, now: number = Date.now()): StreakInfo {
  if (activeDays.size === 0) return { current: 0, longest: 0 };

  let current = 0;
  let cursor: number | null = activeDays.has(dayKey(now))
    ? startOfDay(now)
    : activeDays.has(dayKey(addDays(now, -1)))
      ? addDays(now, -1)
      : null;
  while (cursor !== null && activeDays.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of Array.from(activeDays).sort()) {
    run = previous !== null && daysBetween(previous, key) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  return { current, longest: Math.max(longest, current) };
}

export async function getStreak(now: number = Date.now()): Promise<StreakInfo> {
  const map = await getDailyActivityMap();
  return computeStreak(new Set(map.keys()), now);
}

export interface ReadingTotals {
  activeDurationMs: number;
  wordsRead: number;
  sessions: number;
  lookups: number;
  averageWpm: number;
  /** Lookups per 1,000 words read -- a natural difficulty signal. */
  lookupDensityPer1000: number;
  booksTouched: number;
}

export async function getReadingTotals(range: TimeRange): Promise<ReadingTotals> {
  const sessions = await persistenceService.getReadingSessions(rangeToBounds(range));
  const activeDurationMs = sessions.reduce((sum, s) => sum + s.activeDurationMs, 0);
  const wordsRead = sessions.reduce((sum, s) => sum + s.wordsRead, 0);
  const lookups = sessions.reduce((sum, s) => sum + s.lookupCount, 0);
  return {
    activeDurationMs,
    wordsRead,
    sessions: sessions.length,
    lookups,
    averageWpm: activeDurationMs > 0 ? Math.round((wordsRead / activeDurationMs) * 60_000) : 0,
    lookupDensityPer1000: wordsRead > 0 ? Math.round((lookups / wordsRead) * 1000) : 0,
    booksTouched: new Set(sessions.map((s) => s.bookId)).size,
  };
}

export interface ArabicProfile {
  vocabularyKnown: number;
  rootsKnown: number;
  knownWordPercent: number; // 0..100, share of distinct encountered words that are saved
}

/** All-time by nature, independent of the range filter. Pass `vocabulary`
 * when the caller already loaded it. */
export async function getArabicProfile(vocabulary?: VocabularyItem[]): Promise<ArabicProfile> {
  const [items, encountered, saved] = await Promise.all([
    vocabulary ?? vocabularyService.list(),
    persistenceService.countWordInstances(),
    persistenceService.countSavedWordInstances(),
  ]);
  return {
    vocabularyKnown: items.length,
    rootsKnown: new Set(items.map((v) => v.root).filter(Boolean)).size,
    knownWordPercent: encountered > 0 ? Math.round((saved / encountered) * 100) : 0,
  };
}

/** Vocabulary items saved within the range. */
export async function getVocabularySavedInRange(range: TimeRange, vocabulary?: VocabularyItem[]): Promise<number> {
  const { since = -Infinity, until = Infinity } = rangeToBounds(range);
  const items = vocabulary ?? (await vocabularyService.list());
  return items.filter((v) => v.addedAt >= since && v.addedAt < until).length;
}

/** "Weak vocabulary": still new/learning despite repeated lookups, or lapsed
 * in review at least once. Worst first. */
export async function getWeakVocabulary(limit = 8, vocabulary?: VocabularyItem[]): Promise<VocabularyItem[]> {
  const items = vocabulary ?? (await vocabularyService.list());
  return items
    .filter((v) => v.fsrsLapses > 0 || ((v.mastery === 'new' || v.mastery === 'learning') && v.lookupCount >= 2))
    .sort(
      (a, b) =>
        b.fsrsLapses - a.fsrsLapses || b.lookupCount - a.lookupCount || a.fsrsStability - b.fsrsStability
    )
    .slice(0, limit);
}

/** One zero-filled point per calendar day, for the trend charts. */
export interface TrendPoint {
  date: string;
  activeDurationMs: number;
  wordsRead: number;
  averageWpm: number;
  lookupDensityPer1000: number;
  vocabularyAdded: number;
}

export async function getTrend(range: TimeRange, vocabulary?: VocabularyItem[], now: number = Date.now()): Promise<TrendPoint[]> {
  // "Today" alone has nothing to trend -- show a week of context instead.
  const { since } = rangeToBounds(range === 'today' ? 'week' : range, now);
  const start = since ?? (await earliestActivityDay(now));
  const [dailyMap, items] = await Promise.all([getDailyActivityMap(), vocabulary ?? vocabularyService.list()]);

  const vocabByDay = new Map<string, number>();
  for (const v of items) {
    const key = dayKey(v.addedAt);
    vocabByDay.set(key, (vocabByDay.get(key) ?? 0) + 1);
  }

  const points: TrendPoint[] = [];
  const today = startOfDay(now);
  for (let t = startOfDay(start); t <= today; t = addDays(t, 1)) {
    const key = dayKey(t);
    const activity = dailyMap.get(key);
    const activeDurationMs = activity?.activeDurationMs ?? 0;
    const wordsRead = activity?.wordsRead ?? 0;
    const lookupCount = activity?.lookupCount ?? 0;
    points.push({
      date: key,
      activeDurationMs,
      wordsRead,
      averageWpm: activeDurationMs > 0 ? Math.round((wordsRead / activeDurationMs) * 60_000) : 0,
      lookupDensityPer1000: wordsRead > 0 ? Math.round((lookupCount / wordsRead) * 1000) : 0,
      vocabularyAdded: vocabByDay.get(key) ?? 0,
    });
  }
  return points;
}

async function earliestActivityDay(now: number): Promise<number> {
  const map = await getDailyActivityMap();
  if (map.size === 0) return addDays(now, -6);
  return parseDayKey(Array.from(map.keys()).sort()[0]);
}

/** The sessions that make up one local calendar day. */
export async function getSessionsForDay(date: string): Promise<ReadingSession[]> {
  const since = parseDayKey(date);
  return persistenceService.getReadingSessions({ since, until: addDays(since, 1) });
}
