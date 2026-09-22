import { persistenceService } from '../../persistence';
import { invalidateStatsCache } from '../../stats';
import { newId } from '../../utils/id';

/** No recorded activity for this long stops time counting as "active reading". */
const IDLE_TIMEOUT_MS = 90_000;
/** How often active time is accrued (bounds the idle cutoff's precision). */
const TICK_MS = 15_000;
/** Shorter sessions are almost certainly an open-and-close, not reading. */
const MIN_SESSION_MS_TO_SAVE = 15_000;

/**
 * Tracks one Reader session and persists it as a `ReadingSession` row -- the
 * Dashboard's data source for reading time, words read, WPM, lookups, and
 * streaks. One instance per opened book.
 *
 * The row is written under a fixed id whenever the page is hidden or closed,
 * not just when the Reader unmounts: closing a tab or killing the mobile app
 * never unmounts React, and would otherwise lose the whole session.
 */
export class ReadingSessionTracker {
  private readonly id = newId('rs');
  private readonly bookId: string;
  private readonly bookTitle: string;
  private readonly startedAt = Date.now();
  private readonly startPercent: number;
  private endPercent: number;
  private lastActivityAt = this.startedAt;
  private lastTickAt = this.startedAt;
  private activeDurationMs = 0;
  private lookupCount = 0;
  private readonly seenWords = new Set<string>();
  private readonly visitedSections = new Set<string>();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ended = false;

  constructor(bookId: string, bookTitle: string, startPercent: number) {
    this.bookId = bookId;
    this.bookTitle = bookTitle;
    this.startPercent = startPercent;
    this.endPercent = startPercent;
  }

  start(): void {
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePageHide);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private readonly handlePageHide = () => {
    void this.flush();
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  private tick(): void {
    const now = Date.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;
    if (now - this.lastActivityAt < IDLE_TIMEOUT_MS) this.activeDurationMs += delta;
  }

  /** Any real interaction -- page turn, scroll, tap, key. */
  recordActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /** A dictionary lookup (bubble, popup, or quick-save). */
  recordLookup(): void {
    this.lookupCount += 1;
    this.recordActivity();
  }

  recordPercent(percent: number): void {
    this.endPercent = percent;
    this.recordActivity();
  }

  /** A word that was actually on screen (see observeWordsSeen); `key`
   * identifies the occurrence, so repeat sightings count once. */
  recordWordSeen(key: string): void {
    this.seenWords.add(key);
  }

  /** True only the first time a section renders this session. */
  isFirstVisit(sectionHref: string): boolean {
    if (this.visitedSections.has(sectionHref)) return false;
    this.visitedSections.add(sectionHref);
    return true;
  }

  /** Persists the session so far, if substantial; safe to call repeatedly. */
  async flush(): Promise<void> {
    if (this.ended) return;
    this.tick();
    await this.persist();
  }

  /** Stops tracking and persists the final row. Only the first call acts. */
  async finish(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.handlePageHide);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.tick();
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (this.activeDurationMs < MIN_SESSION_MS_TO_SAVE) return;
    await persistenceService.saveReadingSession({
      id: this.id,
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      activeDurationMs: this.activeDurationMs,
      wordsRead: this.seenWords.size,
      lookupCount: this.lookupCount,
      startPercent: this.startPercent,
      endPercent: this.endPercent,
    });
    invalidateStatsCache();
  }
}
