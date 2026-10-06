import type { PomodoroSession } from '../types';
import { db, startedAtRange, type TimeBounds } from './schema';
import { putSynced } from './writeLayer';

/** Pomodoro sessions, `startedAt` in [since, until). */
export async function savePomodoroSession(session: PomodoroSession): Promise<void> {
  await putSynced('pomodoroSessions', session);
}
export async function getPomodoroSessions(range?: TimeBounds): Promise<PomodoroSession[]> {
  return startedAtRange(db.pomodoroSessions, range);
}
