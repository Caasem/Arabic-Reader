import { persistenceService } from '../../persistence/db';
import { invalidateStatsCache } from '../../stats/readingStatsService';
import type { ReadingSession } from '../../types';

/** How long the reader can go without any recorded activity (scroll, page
 * turn, tap, keypress) before the tracker stops counting elapsed time as
 * "active reading" — this is what separates `activeDurationMs` from the
 * raw wall-clock span between session start and end. */
const IDLE_TIMEOUT_MS = 90_000;
/** How often the tracker advances `activeDurationMs`, in small increments,
 * rather than computing it once at the end — frequent enough that the idle
 * cutoff above is reasonably precise, infrequent enough not to matter for
 * performance. */
const TICK_MS = 15_000;
/** Sessions shorter than this are almost certainly a book opened and
 * immediately closed (or a quick back-navigation) rather than real
 * reading — not worth a row in the log, and would otherwise pollute the
 * heatmap with a sea of near-empty low-value days. */
const MIN_SESSION_MS_TO_SAVE = 15_000;

/**
 * Tracks one normal-Reader reading session and persists it as a
 * `ReadingSession` row — the Dashboard's entire data source for reading
 * time, words read, sessions, WPM, lookup density, streaks, and the
 * activity heatmap. One instance per book per mount; call `start()` when
 * the Reader opens a book and `finish()` when it closes it or switches to
 * a different one.
 *
 * Deliberately simple: no cross-tab coordination, no attempt to recover a
 * session that was never cleanly ended (a crashed tab just loses that last
 * span, the same way the Speed Reader's own session log already does).
 */
export class ReadingSessionTracker {
  private readonly id: string;
  private readonly bookId: string;
  private readonly bookTitle: string;
  private readonly startedAt: number;
  private startPercent: number;
  private endPercent: number;
  private lastActivityAt: number;
  private lastTickAt: number;
  private activeDurationMs = 0;
  private wordsRead = 0;
  private lookupCount = 0;
  private readonly seenSections = new Set<string>();
  private tickHandle: number | null = null;
  private ended = false;

  constructor(bookId: string, bookTitle: string, startPercent: number) {
    this.id = 'rs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    this.bookId = bookId;
    this.bookTitle = bookTitle;
    this.startedAt = Date.now();
    this.lastActivityAt = this.startedAt;
    this.lastTickAt = this.startedAt;
    this.startPercent = startPercent;
    this.endPercent = startPercent;
  }

  start(): void {
    this.tickHandle = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const now = Date.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;
    if (now - this.lastActivityAt < IDLE_TIMEOUT_MS) {
      this.activeDurationMs += delta;
    }
  }

  /** Call on any real reading interaction — page turn, scroll, tap, key —
   * so the idle cutoff above resets. */
  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /** Call once per newly-rendered section with how many `.ar-word` tokens
   * it contains. Each section only counts once per session (re-renders of
   * the same section — a resize, scrolling back — don't re-add its words),
   * which keeps this an estimate of words *shown*, not a precise
   * eye-tracked total. */
  recordSectionWords(sectionHref: string, wordCount: number): void {
    if (this.seenSections.has(sectionHref)) return;
    this.seenSections.add(sectionHref);
    this.wordsRead += wordCount;
    this.recordActivity();
  }

  /** Call once per resolved dictionary lookup (bubble, popup, or
   * quick-save) — this session's own tally, since `WordInstance.lookupCount`
   * is overwritten in place and carries no daily history. */
  recordLookup(): void {
    this.lookupCount += 1;
    this.recordActivity();
  }

  recordPercent(percent: number): void {
    this.endPercent = percent;
    this.recordActivity();
  }

  /** Stops the tracker and persists the session if it was substantial
   * enough to be worth a row (see MIN_SESSION_MS_TO_SAVE). Safe to call
   * more than once — only the first call does anything. */
  async finish(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.tickHandle !== null) window.clearInterval(this.tickHandle);
    // Fold in whatever elapsed since the last tick, same idle rule.
    this.tick();
    if (this.activeDurationMs < MIN_SESSION_MS_TO_SAVE) return;
    const session: ReadingSession = {
      id: this.id,
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      activeDurationMs: this.activeDurationMs,
      wordsRead: this.wordsRead,
      lookupCount: this.lookupCount,
      startPercent: this.startPercent,
      endPercent: this.endPercent,
    };
    await persistenceService.saveReadingSession(session);
    invalidateStatsCache();
  }
}
