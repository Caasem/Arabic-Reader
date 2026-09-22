import { persistenceService } from '../persistence';
import type { PomodoroPhase, PomodoroSession, PomodoroSnapshot, ReaderPreferences } from '../types';
import { newId } from '../utils/id';
import { readJSON, removeKey, STORAGE_KEYS, writeJSON } from '../utils/storage';

const TICK_MS = 1000;

/** A paused phase left this long before the app reopens is ended, not resumed. */
const STALE_PAUSED_MS = 6 * 60 * 60 * 1000;

export type PomodoroPrefs = Pick<
  ReaderPreferences,
  'pomodoroWorkMinutes' | 'pomodoroBreakMinutes' | 'pomodoroAutoCycle' | 'pomodoroNotification'
>;
export type PomodoroOutcome = 'completed' | 'abandoned';

/**
 * Pomodoro timer state machine. A singleton rather than React state because
 * the timer keeps running regardless of which component is mounted; the
 * current phase is snapshotted to localStorage so a reload resumes it.
 *
 * Simplifications: a session's book is whichever was open when the phase
 * started, and a stale paused snapshot is ended rather than offered for resume.
 */
export class PomodoroService {
  private snapshot: PomodoroSnapshot | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly notifyListeners = new Set<(phase: PomodoroPhase, outcome: PomodoroOutcome) => void>();
  private pendingWrite: Promise<void> = Promise.resolve();
  /** Kept in sync with the user's settings by PreferencesProvider. */
  private prefs: PomodoroPrefs = {
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5,
    pomodoroAutoCycle: true,
    pomodoroNotification: 'toast',
  };

  constructor() {
    const restored = readJSON<PomodoroSnapshot>(STORAGE_KEYS.pomodoroSnapshot);
    if (!restored) return;
    const now = Date.now();
    if (restored.running) {
      // No interval ran while the app was closed; fold that time in now.
      restored.activeDurationMs += now - restored.lastTickAt;
      restored.lastTickAt = now;
    } else if (now - restored.lastTickAt > STALE_PAUSED_MS) {
      this.finishSession(restored, 'abandoned');
      return;
    }
    this.snapshot = restored;
    if (restored.running) {
      if (restored.activeDurationMs >= restored.targetDurationMs) this.completePhase();
      else this.startInterval();
    }
  }

  /** New durations apply from the next phase; an in-flight phase keeps its target. */
  setPrefs(prefs: PomodoroPrefs): void {
    this.prefs = prefs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fires once per phase end, after its session row is queued for saving. */
  onNotify(listener: (phase: PomodoroPhase, outcome: PomodoroOutcome) => void): () => void {
    this.notifyListeners.add(listener);
    return () => this.notifyListeners.delete(listener);
  }

  getSnapshot(): PomodoroSnapshot | null {
    return this.snapshot;
  }

  /** Resolves once every queued session write has landed (used by tests). */
  whenIdle(): Promise<void> {
    return this.pendingWrite;
  }

  start(book: { id: string; title: string } | null, phase: PomodoroPhase = 'work'): void {
    this.stopInterval();
    const minutes = phase === 'work' ? this.prefs.pomodoroWorkMinutes : this.prefs.pomodoroBreakMinutes;
    const now = Date.now();
    this.snapshot = {
      phase,
      bookId: book?.id ?? null,
      bookTitle: book?.title ?? null,
      targetDurationMs: minutes * 60_000,
      activeDurationMs: 0,
      running: true,
      startedAt: now,
      lastTickAt: now,
    };
    this.persist();
    this.startInterval();
  }

  pause(): void {
    if (!this.snapshot?.running) return;
    this.tick();
    if (!this.snapshot?.running) return; // the tick may have completed the phase
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

  /** Ends the phase early; an explicit Stop never counts as completed. */
  stop(): void {
    if (!this.snapshot) return;
    if (this.snapshot.running) this.tick();
    if (this.snapshot) this.finishSession(this.snapshot, 'abandoned');
  }

  private startInterval(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.tick(), TICK_MS);
  }

  private stopInterval(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
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
      const book = finished.bookId ? { id: finished.bookId, title: finished.bookTitle ?? '' } : null;
      this.start(book, finished.phase === 'work' ? 'break' : 'work');
    }
  }

  private finishSession(snapshot: PomodoroSnapshot, status: PomodoroOutcome): void {
    const session: PomodoroSession = {
      id: newId('pmd'),
      phase: snapshot.phase,
      bookId: snapshot.bookId,
      bookTitle: snapshot.bookTitle,
      targetDurationMs: snapshot.targetDurationMs,
      activeDurationMs: Math.min(snapshot.activeDurationMs, status === 'completed' ? snapshot.targetDurationMs : Infinity),
      status,
      // Snapshots written before `startedAt` existed fall back to an estimate.
      startedAt: snapshot.startedAt ?? snapshot.lastTickAt - snapshot.activeDurationMs,
      endedAt: Date.now(),
    };
    this.pendingWrite = this.pendingWrite.then(() => persistenceService.savePomodoroSession(session)).catch(() => {});
    this.snapshot = null;
    this.persist();
    this.notifyListeners.forEach((l) => l(snapshot.phase, status));
  }

  private persist(): void {
    if (this.snapshot) writeJSON(STORAGE_KEYS.pomodoroSnapshot, this.snapshot);
    else removeKey(STORAGE_KEYS.pomodoroSnapshot);
    this.listeners.forEach((l) => l());
  }
}

export const pomodoroService = new PomodoroService();
