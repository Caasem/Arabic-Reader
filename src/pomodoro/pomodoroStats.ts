import { persistenceService } from '../persistence/db';
import { rangeToBounds, type TimeRange } from '../stats/readingStatsService';

export interface PomodoroTotals {
  completed: number;
  abandoned: number;
  /** Sum of every session's actual active time, work and break alike,
   * completed or abandoned -- "focus time" counts what was actually spent,
   * not just the sessions that happened to finish clean. */
  totalFocusMs: number;
  averageDurationMs: number;
  /** Work-phase sessions only, grouped by book, sums descending -- a break
   * isn't "time spent on a book" the way a work phase is. */
  bookBreakdown: { bookTitle: string; ms: number; sessions: number }[];
}

export async function getPomodoroTotals(range: TimeRange): Promise<PomodoroTotals> {
  const { since, until } = rangeToBounds(range);
  const sessions = await persistenceService.getPomodoroSessions({ since, until });
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const abandoned = sessions.filter((s) => s.status === 'abandoned').length;
  const totalFocusMs = sessions.reduce((sum, s) => sum + s.activeDurationMs, 0);
  const averageDurationMs = sessions.length > 0 ? Math.round(totalFocusMs / sessions.length) : 0;

  const byBook = new Map<string, { bookTitle: string; ms: number; sessions: number }>();
  for (const s of sessions) {
    if (s.phase !== 'work') continue;
    const key = s.bookId ?? '__general__';
    const title = s.bookTitle ?? 'General Study';
    const entry = byBook.get(key) ?? { bookTitle: title, ms: 0, sessions: 0 };
    entry.ms += s.activeDurationMs;
    entry.sessions += 1;
    byBook.set(key, entry);
  }
  const bookBreakdown = Array.from(byBook.values()).sort((a, b) => b.ms - a.ms);

  return { completed, abandoned, totalFocusMs, averageDurationMs, bookBreakdown };
}
