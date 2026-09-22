import type { PomodoroSession } from '../types';
import { db, startedAtRange, type TimeBounds } from './schema';

/** Pomodoro sessions, `startedAt` in [since, until). */
export async function savePomodoroSession(session: PomodoroSession): Promise<void> {
  await db.pomodoroSessions.put(session);
}
export async function getPomodoroSessions(range?: TimeBounds): Promise<PomodoroSession[]> {
  return startedAtRange(db.pomodoroSessions, range);
}
