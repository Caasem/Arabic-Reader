import type { ReadingSession } from '../types';
import { db, startedAtRange, type TimeBounds } from './schema';
import { putSynced } from './writeLayer';

/** Reading sessions (Dashboard data source), `startedAt` in [since, until). */
export async function saveReadingSession(session: ReadingSession): Promise<void> {
  await putSynced('readingSessions', session);
}
export async function getReadingSessions(range?: TimeBounds): Promise<ReadingSession[]> {
  return startedAtRange(db.readingSessions, range);
}
