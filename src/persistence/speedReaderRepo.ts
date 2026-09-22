import type { SpeedReaderPosition, SpeedReaderSession } from '../types';
import { db } from './schema';

export async function saveSpeedReaderPosition(pos: SpeedReaderPosition): Promise<void> {
  await db.speedReaderPositions.put(pos);
}
export async function getSpeedReaderPosition(bookId: string): Promise<SpeedReaderPosition | undefined> {
  return db.speedReaderPositions.get(bookId);
}
export async function saveSpeedReaderSession(session: SpeedReaderSession): Promise<void> {
  await db.speedReaderSessions.put(session);
}
export async function getSpeedReaderSessions(bookId?: string): Promise<SpeedReaderSession[]> {
  const rows = bookId
    ? await db.speedReaderSessions.where('bookId').equals(bookId).toArray()
    : await db.speedReaderSessions.toArray();
  return rows.sort((a, b) => b.endedAt - a.endedAt);
}
