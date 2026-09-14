// ---------------------------------------------------------------------------
// Pomodoro
// ---------------------------------------------------------------------------

export type PomodoroPhase = 'work' | 'break';
export type PomodoroSessionStatus = 'completed' | 'abandoned';

/** One work or break run; a work phase and its break are separate rows.
 * `bookId`/`bookTitle` are null for a session started with no book open
 * ("General Study" in stats). */
export interface PomodoroSession {
  id: string;
  phase: PomodoroPhase;
  bookId: string | null;
  bookTitle: string | null;
  targetDurationMs: number;
  /** Running time, pauses excluded -- what completion and focus totals use. */
  activeDurationMs: number;
  status: PomodoroSessionStatus;
  startedAt: number;
  endedAt: number;
}

/** The phase in progress, persisted so a reload resumes it. */
export interface PomodoroSnapshot {
  phase: PomodoroPhase;
  bookId: string | null;
  bookTitle: string | null;
  targetDurationMs: number;
  /** When the phase started (absent in snapshots saved by older versions). */
  startedAt?: number;
  /** Active time elapsed as of `lastTickAt`. */
  activeDurationMs: number;
  /** When false, `activeDurationMs` is exact and no time accrues. */
  running: boolean;
  /** When `activeDurationMs` was computed, so a resume can add time since. */
  lastTickAt: number;
}

// ---------------------------------------------------------------------------
// Speed Reader (RSVP)
// ---------------------------------------------------------------------------

/** One RSVP display unit: usually a word with its attached punctuation (see
 * speedReader/tokenStream.ts). `lookupWord` is the bare Arabic form for
 * dictionary lookups; undefined for tokens with no Arabic, which display
 * but aren't clickable. */
export interface RsvpToken {
  display: string;
  lookupWord?: string;
  sectionHref: string;
  globalIndex: number;
}

export interface RsvpChapter {
  href: string;
  label: string;
  startIndex: number;
  endIndex: number; // exclusive
}

/** Where the Speed Reader left off in a book: a word index into the token
 * stream, separate from the Reader's CFI-based position. */
export interface SpeedReaderPosition {
  bookId: string;
  sectionHref: string;
  globalIndex: number;
  updatedAt: number;
}

export interface SpeedReaderSession {
  id: string;
  bookId: string;
  bookTitle: string;
  wordsRead: number;
  durationMs: number;
  averageWpm: number;
  bookProgressPercent: number; // 0..1, at the end of the session
  endedAt: number;
}

// ---------------------------------------------------------------------------
// Reading sessions (the Dashboard's data source)
// ---------------------------------------------------------------------------

/** One span of normal reading, logged by ReadingSessionTracker. Vocabulary
 * stats are read live from `vocabulary`/`wordInstances`; `lookupCount` is
 * kept here because WordInstance counts have no daily history. */
export interface ReadingSession {
  id: string;
  bookId: string;
  bookTitle: string;
  startedAt: number;
  endedAt: number;
  /** Time between start and end minus idle stretches past the tracker's
   * idle cutoff -- what "reading time" means throughout the Dashboard. */
  activeDurationMs: number;
  /** Arabic words that actually scrolled into view during the session. */
  wordsRead: number;
  /** Dictionary lookups (popup, bubble, or quick-save) during the session. */
  lookupCount: number;
  startPercent: number;
  endPercent: number;
}
