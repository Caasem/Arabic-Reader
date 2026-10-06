/**
 * When to sync (docs/specs/storage-and-sync.md, "Triggers"). Pure timing logic
 * with injected timers so the rules can be tested exactly.
 *
 * - A local change starts (or restarts) a short debounce, then one sync runs.
 * - Opening the app, coming back online and the Sync now button run right away.
 * - Backgrounding the app asks for a run too, but that is best-effort only: the
 *   OS can kill the app first, so nothing may depend on it.
 * - While the window is visible, a slow poll picks up other devices' changes.
 * - A failed run backs off (30 s, 60 s, ... up to 5 min). Automatic triggers
 *   wait out the backoff; ones the user caused do not.
 * - Runs never overlap. A trigger that arrives mid-run causes one more run.
 */

export type SyncReason = 'open' | 'change' | 'background' | 'online' | 'poll' | 'manual';

export interface SchedulerTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface SchedulerOptions {
  run(reason: SyncReason): Promise<void>;
  /** Checked before every run; a disabled scheduler never runs. */
  isEnabled(): boolean | Promise<boolean>;
  debounceMs?: number;
  /** Poll for other devices' changes this often while visible. 0 turns it off. */
  pollMs?: number;
  isVisible?(): boolean;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  now?(): number;
  timers?: SchedulerTimers;
}

export interface SchedulerState {
  running: boolean;
  /** Consecutive failed runs. */
  failures: number;
  lastError: string | null;
  lastRunAt: number | null;
}

const realTimers: SchedulerTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSyncScheduler(options: SchedulerOptions) {
  const {
    run,
    isEnabled,
    debounceMs = 10_000,
    pollMs = 0,
    isVisible = () => true,
    backoffBaseMs = 30_000,
    backoffMaxMs = 5 * 60_000,
    now = Date.now,
    timers = realTimers,
  } = options;

  let state: SchedulerState = { running: false, failures: 0, lastError: null, lastRunAt: null };
  let timer: unknown = null;
  let pollHandle: unknown = null;
  let pending: SyncReason | null = null;
  /** Automatic triggers wait until this time after a failure. */
  let retryNotBefore = 0;
  let disposed = false;
  const listeners = new Set<(s: SchedulerState) => void>();

  const setState = (patch: Partial<SchedulerState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  function schedule(reason: SyncReason, delayMs: number, bypassBackoff: boolean) {
    if (disposed) return;
    pending = pending === 'manual' ? 'manual' : reason;
    const at = Math.max(now() + delayMs, bypassBackoff ? 0 : retryNotBefore);
    if (timer !== null) timers.clear(timer);
    timer = timers.set(fire, Math.max(0, at - now()));
  }

  function fire() {
    timer = null;
    if (disposed || state.running || pending === null) return; // a running pass reschedules itself when it ends
    void start();
  }

  async function start() {
    const reason = pending as SyncReason; // `fire` only starts a run when something is pending
    pending = null;
    if (!(await isEnabled())) return;
    setState({ running: true });
    try {
      await run(reason);
      retryNotBefore = 0;
      setState({ failures: 0, lastError: null, lastRunAt: now() });
    } catch (error) {
      const failures = state.failures + 1;
      retryNotBefore = now() + Math.min(backoffMaxMs, backoffBaseMs * 2 ** (failures - 1));
      setState({ failures, lastError: error instanceof Error ? error.message : String(error), lastRunAt: now() });
      pending ??= reason; // try again once the backoff is over
    } finally {
      setState({ running: false });
      if (pending !== null && timer === null && !disposed) schedule(pending, state.failures > 0 ? 0 : debounceMs, false);
    }
  }

  if (pollMs > 0) {
    const tick = () => {
      if (disposed) return;
      if (isVisible() && !state.running && pending === null) schedule('poll', 0, false);
      pollHandle = timers.set(tick, pollMs);
    };
    pollHandle = timers.set(tick, pollMs);
  }

  return {
    /** A local change was saved. */
    notifyChange: () => schedule('change', debounceMs, false),
    /** Run as soon as possible. Opening, coming online and Sync now skip any backoff; the rest wait it out. */
    trigger: (reason: SyncReason) => schedule(reason, 0, reason === 'manual' || reason === 'open' || reason === 'online'),
    getState: () => state,
    subscribe(listener: (s: SchedulerState) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      if (timer !== null) timers.clear(timer);
      if (pollHandle !== null) timers.clear(pollHandle);
      timer = pollHandle = null;
      listeners.clear();
    },
  };
}
