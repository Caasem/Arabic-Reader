/**
 * Single source of truth for every number the Reading Dashboard shows.
 * Nothing here owns data — it all reads from tables that already exist
 * (`readingSessions`, `vocabulary`, `wordInstances`) and derives the rest,
 * so there's exactly one place that knows how "reading time" or "known
 * word" is defined, and the Dashboard can't drift out of sync with the
 * rest of the app's own vocabulary/session logic.
 */
import { persistenceService } from '../persistence/db';
import { vocabularyService } from '../vocabulary/vocabularyService';
import type { ReadingSession, VocabularyItem } from '../types';

export type TimeRange = 'today' | 'week' | 'month' | '90d' | 'all';

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  '90d': '90 days',
  all: 'All time',
};

/** Local-calendar-day key (YYYY-MM-DD, device timezone) — the single
 * definition of "a day" used everywhere in the Dashboard (heatmap cells,
 * streaks, daily trend buckets), so they can't disagree with each other. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function rangeToBounds(range: TimeRange, now: number = Date.now()): { since?: number; until?: number } {
  const todayStart = startOfDay(now);
  switch (range) {
    case 'today':
      return { since: todayStart };
    case 'week':
      return { since: todayStart - 6 * 86_400_000 }; // last 7 calendar days, inclusive of today
    case 'month':
      return { since: todayStart - 29 * 86_400_000 };
    case '90d':
      return { since: todayStart - 89 * 86_400_000 };
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

/** In-memory memoization of the full session log, grouped by day — not a
 * persisted table (the plan was one new table, `readingSessions`, and
 * nothing more), just enough to keep the heatmap/streak/trend queries from
 * re-summing the whole log on every render within one Dashboard visit.
 * Cleared whenever a fresh session is saved (see `invalidate`). */
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
    const existing = map.get(key);
    if (existing) {
      existing.activeDurationMs += s.activeDurationMs;
      existing.wordsRead += s.wordsRead;
      existing.lookupCount += s.lookupCount;
      existing.sessions += 1;
    } else {
      map.set(key, {
        date: key,
        activeDurationMs: s.activeDurationMs,
        wordsRead: s.wordsRead,
        lookupCount: s.lookupCount,
        sessions: 1,
      });
    }
  }
  dailyActivityCache = map;
  return map;
}

/** Every day with at least one logged session, most recent first — the
 * heatmap and trend charts both slice this rather than re-querying. */
export async function getDailyActivity(): Promise<DayActivity[]> {
  const map = await getDailyActivityMap();
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface StreakInfo {
  current: number;
  longest: number;
}

/** Current streak = consecutive active days ending today or yesterday (a
 * day not yet over shouldn't zero out yesterday's streak); longest = the
 * best run anywhere in the log. Both are always computed over the full
 * history — a streak isn't a thing that makes sense "for the last 7 days"
 * — independent of the Dashboard's range filter. */
export async function getStreak(now: number = Date.now()): Promise<StreakInfo> {
  const map = await getDailyActivityMap();
  if (map.size === 0) return { current: 0, longest: 0 };

  let current = 0;
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(now - 86_400_000);
  let cursor = map.has(todayKey) ? now : map.has(yesterdayKey) ? now - 86_400_000 : null;
  while (cursor !== null && map.has(dayKey(cursor))) {
    current++;
    cursor -= 86_400_000;
  }

  let longest = 0;
  let run = 0;
  const sortedKeys = Array.from(map.keys()).sort();
  let prevTime: number | null = null;
  for (const key of sortedKeys) {
    const t = startOfDay(new Date(key).getTime());
    if (prevTime !== null && t - prevTime === 86_400_000) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prevTime = t;
  }

  return { current, longest: Math.max(longest, current) };
}

export interface ReadingTotals {
  activeDurationMs: number;
  wordsRead: number;
  sessions: number;
  lookups: number;
  averageWpm: number;
  /** Lookups per 1,000 words read — how often reading gets interrupted by
   * a dictionary check, a natural difficulty signal. */
  lookupDensityPer1000: number;
  booksTouched: number;
}

export async function getReadingTotals(range: TimeRange): Promise<ReadingTotals> {
  const { since, until } = rangeToBounds(range);
  const sessions = await persistenceService.getReadingSessions({ since, until });
  const activeDurationMs = sessions.reduce((sum, s) => sum + s.activeDurationMs, 0);
  const wordsRead = sessions.reduce((sum, s) => sum + s.wordsRead, 0);
  const lookups = sessions.reduce((sum, s) => sum + s.lookupCount, 0);
  const averageWpm = activeDurationMs > 0 ? Math.round((wordsRead / activeDurationMs) * 60_000) : 0;
  const lookupDensityPer1000 = wordsRead > 0 ? Math.round((lookups / wordsRead) * 1000) : 0;
  const booksTouched = new Set(sessions.map((s) => s.bookId)).size;
  return { activeDurationMs, wordsRead, sessions: sessions.length, lookups, averageWpm, lookupDensityPer1000, booksTouched };
}

export interface ArabicProfile {
  vocabularyKnown: number;
  rootsKnown: number;
  knownWordPercent: number; // 0..100, share of distinct encountered words already saved
}

/** All-time by nature (a "vocabulary known" count that reset every week
 * would be meaningless) — not affected by the Dashboard's range filter. */
export async function getArabicProfile(): Promise<ArabicProfile> {
  const [vocabulary, wordInstances] = await Promise.all([
    vocabularyService.list(),
    persistenceService.getAllWordInstances(),
  ]);
  const vocabularyKnown = vocabulary.length;
  const rootsKnown = new Set(vocabulary.map((v) => v.root).filter(Boolean)).size;
  const distinctEncountered = wordInstances.length;
  const savedEncountered = wordInstances.filter((w) => w.saved).length;
  const knownWordPercent = distinctEncountered > 0 ? Math.round((savedEncountered / distinctEncountered) * 100) : 0;
  return { vocabularyKnown, rootsKnown, knownWordPercent };
}

/** How many vocabulary items were newly saved within the selected range —
 * distinct from `ArabicProfile.vocabularyKnown` (the running total),
 * this is the range-filtered rate metric for the Reading Statistics list. */
export async function getVocabularySavedInRange(range: TimeRange): Promise<number> {
  const { since, until } = rangeToBounds(range);
  const vocabulary = await vocabularyService.list();
  return vocabulary.filter((v) => v.addedAt >= (since ?? -Infinity) && v.addedAt < (until ?? Infinity)).length;
}

/** "Weak vocabulary" for the Current Focus section — derived from FSRS
 * state and lookup behavior already tracked on every VocabularyItem, never
 * a fixed list. A word qualifies by being either not yet comfortably
 * recalled (still new/learning) despite repeated lookups, or by having
 * lapsed in review at least once. Ranked worst-first. */
export async function getWeakVocabulary(limit = 8): Promise<VocabularyItem[]> {
  const vocabulary = await vocabularyService.list();
  const candidates = vocabulary.filter(
    (v) => v.fsrsLapses > 0 || ((v.mastery === 'new' || v.mastery === 'learning') && v.lookupCount >= 2)
  );
  return candidates
    .sort((a, b) => {
      if (b.fsrsLapses !== a.fsrsLapses) return b.fsrsLapses - a.fsrsLapses;
      if (b.lookupCount !== a.lookupCount) return b.lookupCount - a.lookupCount;
      return a.fsrsStability - b.fsrsStability;
    })
    .slice(0, limit);
}

/** One point per calendar day in `[since, until)` for the trend charts —
 * always dense (every day present, zero-filled) so a chart never has to
 * guess whether a gap means "no data yet" or "zero that day". */
export interface TrendPoint {
  date: string;
  activeDurationMs: number;
  wordsRead: number;
  averageWpm: number;
  lookupDensityPer1000: number;
  vocabularyAdded: number;
}

export async function getTrend(range: TimeRange): Promise<TrendPoint[]> {
  const now = Date.now();
  const { since } = rangeToBounds(range === 'today' ? 'week' : range, now); // "today" has nothing to trend — fall back to a week of context
  const start = since ?? (await earliestActivityDay(now));
  const [dailyMap, vocabulary] = await Promise.all([getDailyActivityMap(), vocabularyService.list()]);

  const vocabByDay = new Map<string, number>();
  for (const v of vocabulary) {
    const key = dayKey(v.addedAt);
    vocabByDay.set(key, (vocabByDay.get(key) ?? 0) + 1);
  }

  const points: TrendPoint[] = [];
  for (let t = startOfDay(start); t <= startOfDay(now); t += 86_400_000) {
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

async function earliestActivityDay(fallback: number): Promise<number> {
  const map = await getDailyActivityMap();
  if (map.size === 0) return fallback - 6 * 86_400_000;
  const keys = Array.from(map.keys()).sort();
  return new Date(keys[0]).getTime();
}

/** Powers the calendar's per-day drill-in panel — the actual sessions that
 * made up a given day, not just the rolled-up totals. */
export async function getSessionsForDay(date: string): Promise<ReadingSession[]> {
  const dayStart = new Date(date).getTime();
  const dayEnd = dayStart + 86_400_000;
  return persistenceService.getReadingSessions({ since: dayStart, until: dayEnd });
}

