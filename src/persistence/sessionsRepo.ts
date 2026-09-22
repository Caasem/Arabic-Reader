import type { ReadingSession } from '../types';
import { db, startedAtRange, type TimeBounds } from './schema';

/** Reading sessions (Dashboard data source), `startedAt` in [since, until). */
export async function saveReadingSession(session: ReadingSession): Promise<void> {
  await db.readingSessions.put(session);
}
export async function getReadingSessions(range?: TimeBounds): Promise<ReadingSession[]> {
  return startedAtRange(db.readingSessions, range);
}
