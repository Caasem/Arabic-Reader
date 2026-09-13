import { persistenceService } from '../persistence/db';
import type { PomodoroPhase, PomodoroSession, PomodoroSnapshot, ReaderPreferences } from '../types';

const SNAPSHOT_KEY = 'arabic-reader:pomodoroSnapshot';
const TICK_MS = 1000;

/** Ends a resumed session that's been sitting paused since before the app
 * was last closed for longer than this -- resuming a break from three days
 * ago isn't useful, and would otherwise linger forever since nothing else
 * ever clears a paused snapshot on its own. */
const STALE_PAUSED_MS = 6 * 60 * 60 * 1000; // 6 hours

function readSnapshot(): PomodoroSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as PomodoroSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: PomodoroSnapshot | null): void {
  try {
    if (snapshot) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    else localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // best-effort only -- a lost snapshot just means the in-flight phase
    // can't be resumed after a reload, not a real data-loss risk
  }
}

function makeId(): string {
  return 'pmd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Pomodoro timer state machine. A singleton (same pattern as
 * vocabularyService/bookmarkService) rather than React state, since the
 * timer needs to keep running (and its snapshot needs to keep persisting)
 * independent of whichever component happens to be mounted -- the reader
 * header button just opens a view onto whatever this is already doing.
 *
 * Simplifications versus the full feature spec, both called out again in
 * their own comments below: a session's `bookId` is fixed at whichever book
 * was open when the phase *started* (no proportional time-split tracking
 * across a mid-session book switch), and a paused snapshot found stale on
 * reload is simply discarded rather than surfaced as a "Resume?" prompt.
 */
class PomodoroService {
  private snapshot: PomodoroSnapshot | null = null;
  private intervalId: number | null = null;
  private listeners = new Set<() => void>();
  private notifyListeners = new Set<(phase: PomodoroPhase, kind: 'completed' | 'abandoned') => void>();
  private prefs: Pick<
    ReaderPreferences,
    'pomodoroWorkMinutes' | 'pomodoroBreakMinutes' | 'pomodoroAutoCycle' | 'pomodoroNotification'
  > = {
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroAutoCycle: true,
    pomodoroNotification: 'toast',
  };

  constructor() {
    const restored = readSnapshot();
    if (restored) {
      // Account for time passed while the app was closed/backgrounded --
      // there was no live interval ticking then, so the elapsed wall-clock
      // time since the snapshot's own last tick has to be added in now,
      // same as a running phase would have accrued it tick-by-tick.
      if (restored.running) {
        restored.activeDurationMs += Date.now() - restored.lastTickAt;
        restored.lastTickAt = Date.now();
      } else if (Date.now() - restored.lastTickAt > STALE_PAUSED_MS) {
        this.finishSession(restored, 'abandoned');
        return;
      }
      this.snapshot = restored;
      if (this.snapshot.running) {
        if (this.snapshot.activeDurationMs >= this.snapshot.targetDurationMs) this.completePhase();
        else this.startInterval();
      }
    }
  }

  /** Called once from PreferencesContext (or the timer UI) whenever
   * durations/auto-cycle settings change, so a phase already running picks
   * up a *new* target only the next time it's started -- an in-flight
   * phase keeps the target it began with. */
  setPrefs(prefs: PomodoroService['prefs']): void {
    this.prefs = prefs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fires once per phase completion/abandonment, after the row is already
   * persisted -- the timer UI uses this to show a toast/play a sound per
   * `pomodoroNotification`, without this service needing to know anything
   * about how notifications are actually presented. */
  onNotify(listener: (phase: PomodoroPhase, kind: 'completed' | 'abandoned') => void): () => void {
    this.notifyListeners.add(listener);
    return () => this.notifyListeners.delete(listener);
  }

  getSnapshot(): PomodoroSnapshot | null {
    return this.snapshot;
  }

  start(book: { id: string; title: string } | null, phase: PomodoroPhase = 'work'): void {
    this.stopInterval();
    const minutes = phase === 'work' ? this.prefs.pomodoroWorkMinutes : this.prefs.pomodoroBreakMinutes;
    this.snapshot = {
      phase,
      bookId: book?.id ?? null,
      bookTitle: book?.title ?? null,
      targetDurationMs: minutes * 60_000,
      activeDurationMs: 0,
      running: true,
      lastTickAt: Date.now(),
    };
    this.persist();
    this.startInterval();
  }

  pause(): void {
    if (!this.snapshot?.running) return;
    this.tick(); // fold in the time since the last tick before freezing
    this.snapshot.running = false;
    this.stopInterval();
    this.persist();
  }

  resume(): void {
    if (!this.snapshot || this.snapshot.running) return;
    this.snapshot.running = true;
    this.snapshot.lastTickAt = Date.now();
    this.persist();
    this.startInterval();
  }

  /** Ends the current phase early, marked abandoned regardless of how much
   * time had already accrued -- an explicit Stop always means "this run
   * doesn't count as completed," even at 24:59 of a 25:00 work phase. */
  stop(): void {
    if (!this.snapshot) return;
    if (this.snapshot.running) this.tick();
    this.finishSession(this.snapshot, 'abandoned');
  }

  private startInterval(): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => this.tick(), TICK_MS);
  }

  private stopInterval(): void {
    if (this.intervalId === null) return;
    window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private tick(): void {
    if (!this.snapshot?.running) return;
    const now = Date.now();
    this.snapshot.activeDurationMs += now - this.snapshot.lastTickAt;
    this.snapshot.lastTickAt = now;
    if (this.snapshot.activeDurationMs >= this.snapshot.targetDurationMs) {
      this.completePhase();
      return;
    }
    this.persist();
  }

  private completePhase(): void {
    if (!this.snapshot) return;
    const finished = this.snapshot;
    this.stopInterval();
    this.finishSession(finished, 'completed');
    if (this.prefs.pomodoroAutoCycle) {
      const nextPhase: PomodoroPhase = finished.phase === 'work' ? 'break' : 'work';
      this.start(finished.bookId ? { id: finished.bookId, title: finished.bookTitle ?? '' } : null, nextPhase);
    }
  }

  /** Persists the finished phase as a row, notifies listeners, and clears
   * the live snapshot (a following auto-cycle start immediately replaces
   * it, if enabled). */
  private finishSession(snapshot: PomodoroSnapshot, status: 'completed' | 'abandoned'): void {
    const session: PomodoroSession = {
      id: makeId(),
      phase: snapshot.phase,
      bookId: snapshot.bookId,
      bookTitle: snapshot.bookTitle,
      targetDurationMs: snapshot.targetDurationMs,
      activeDurationMs: snapshot.activeDurationMs,
      status,
      startedAt: snapshot.lastTickAt - snapshot.activeDurationMs,
      endedAt: Date.now(),
    };
    persistenceService.savePomodoroSession(session);
    this.snapshot = null;
    this.persist();
    this.notifyListeners.forEach((l) => l(snapshot.phase, status));
    this.listeners.forEach((l) => l());
  }

  private persist(): void {
    writeSnapshot(this.snapshot);
    this.listeners.forEach((l) => l());
  }
}

export const pomodoroService = new PomodoroService();
