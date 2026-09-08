import { persistenceService } from '../persistence/db';
import type { BookMeta, RsvpToken, SpeedReaderPosition, SpeedReaderSession } from '../types';
import { getTokenStream, type TokenStream } from './tokenStream';

export const WPM_PRESETS = [100, 150, 200, 250, 300, 400, 500, 600] as const;
export const MIN_WPM = 60;
export const MAX_WPM = 900;

/** Milliseconds a single token stays on screen at a given WPM. Longer
 * tokens (measured in letters, not raw characters, so diacritics don't
 * unfairly slow a heavily-vocalized word) get a small extra dwell time —
 * the same "give long words a beat longer" adjustment most RSVP readers
 * apply, since a fixed per-word interval alone makes long words feel rushed
 * relative to short ones even though both count as "one word" for WPM. */
export function msPerWord(wpm: number, token: RsvpToken): number {
  const base = 60_000 / Math.max(MIN_WPM, Math.min(MAX_WPM, wpm));
  const letters = [...token.display].length;
  const longWordFactor = letters > 7 ? 1 + Math.min(0.6, (letters - 7) * 0.06) : 1;
  // A trailing sentence-ending mark earns a brief extra pause — mirrors the
  // natural beat a reader takes at the end of a sentence.
  const endsSentence = /[.!؟?]\s*$/.test(token.display);
  return Math.round(base * longWordFactor * (endsSentence ? 1.5 : 1));
}

export interface SpeedReaderStream extends TokenStream {
  bookId: string;
}

export async function loadStream(bookId: string): Promise<SpeedReaderStream> {
  const stream = await getTokenStream(bookId);
  return { ...stream, bookId };
}

export async function getResumePosition(bookId: string): Promise<SpeedReaderPosition | undefined> {
  return persistenceService.getSpeedReaderPosition(bookId);
}

export async function savePosition(bookId: string, sectionHref: string, globalIndex: number): Promise<void> {
  await persistenceService.saveSpeedReaderPosition({
    bookId,
    sectionHref,
    globalIndex,
    updatedAt: Date.now(),
  });
}

export async function recordSession(params: {
  book: BookMeta;
  wordsRead: number;
  durationMs: number;
  bookProgressPercent: number;
}): Promise<SpeedReaderSession> {
  const averageWpm = params.durationMs > 0 ? Math.round((params.wordsRead / params.durationMs) * 60_000) : 0;
  const session: SpeedReaderSession = {
    id: 'srsess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    bookId: params.book.id,
    bookTitle: params.book.title,
    wordsRead: params.wordsRead,
    durationMs: params.durationMs,
    averageWpm,
    bookProgressPercent: params.bookProgressPercent,
    endedAt: Date.now(),
  };
  await persistenceService.saveSpeedReaderSession(session);
  return session;
}

export async function getSessions(bookId?: string): Promise<SpeedReaderSession[]> {
  return persistenceService.getSpeedReaderSessions(bookId);
}

/** Lifetime average WPM across every completed session (all books, unless
 * `bookId` narrows it) — a simple words-read-weighted average rather than
 * an average-of-averages, so long sessions aren't drowned out by many short
 * ones. */
export async function getLifetimeAverageWpm(bookId?: string): Promise<number> {
  const sessions = await getSessions(bookId);
  const totalWords = sessions.reduce((sum, s) => sum + s.wordsRead, 0);
  const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
  if (totalMs === 0) return 0;
  return Math.round((totalWords / totalMs) * 60_000);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
