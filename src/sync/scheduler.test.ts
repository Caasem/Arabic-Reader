import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncScheduler, type SchedulerOptions, type SyncReason } from './scheduler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(over: Partial<SchedulerOptions> = {}) {
  const runs: SyncReason[] = [];
  let enabled = true;
  let fail = false;
  let gate: Promise<void> | null = null;
  const scheduler = createSyncScheduler({
    run: async (reason) => {
      runs.push(reason);
      if (gate) await gate;
      if (fail) throw new Error('folder unavailable');
    },
    isEnabled: () => enabled,
    debounceMs: 10_000,
    ...over,
  });
  return {
    scheduler,
    runs,
    setEnabled: (v: boolean) => (enabled = v),
    setFail: (v: boolean) => (fail = v),
    holdRuns() {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
  };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('debounce', () => {
  it('runs once, 10 s after the last of a burst of changes', async () => {
    const { scheduler, runs } = setup();
    scheduler.notifyChange();
    await advance(6_000);
    scheduler.notifyChange(); // restarts the wait
    await advance(6_000);
    expect(runs).toEqual([]);
    await advance(4_100);
    expect(runs).toEqual(['change']);
  });

  it('runs nothing when sync is not enabled', async () => {
    const { scheduler, runs, setEnabled } = setup();
    setEnabled(false);
    scheduler.notifyChange();
    scheduler.trigger('open');
    await advance(30_000);
    expect(runs).toEqual([]);
  });
});

describe('immediate triggers', () => {
  it('opening the app runs right away, and replaces a pending debounce rather than adding a run', async () => {
    const { scheduler, runs } = setup();
    scheduler.notifyChange();
    scheduler.trigger('open');
    await advance(1);
    expect(runs).toEqual(['open']);
    await advance(20_000);
    expect(runs).toEqual(['open']);
  });

  it('a manual run wins over a queued automatic one', async () => {
    const { scheduler, runs } = setup();
    scheduler.trigger('background');
    scheduler.trigger('manual');
    await advance(1);
    expect(runs).toEqual(['manual']);
  });
});

describe('overlap', () => {
  it('never runs two at once; a change during a run causes exactly one more afterwards', async () => {
    const { scheduler, runs, holdRuns } = setup();
    const release = holdRuns();
    scheduler.trigger('manual');
    await advance(1);
    expect(scheduler.getState().running).toBe(true);

    scheduler.notifyChange();
    scheduler.notifyChange();
    await advance(15_000);
    expect(runs).toEqual(['manual']); // still the first run

    release();
    await advance(1);
    expect(scheduler.getState().running).toBe(false);
    await advance(10_100);
    expect(runs).toEqual(['manual', 'change']);
    await advance(60_000);
    expect(runs).toHaveLength(2);
  });
});

describe('failure and backoff', () => {
  it('retries after 30 s, then 60 s, then resets once a run succeeds', async () => {
    const { scheduler, runs, setFail } = setup();
    setFail(true);
    scheduler.trigger('manual');
    await advance(1);
    expect(runs).toHaveLength(1);
    expect(scheduler.getState()).toMatchObject({ failures: 1, lastError: 'folder unavailable' });

    await advance(29_000);
    expect(runs).toHaveLength(1);
    await advance(1_500);
    expect(runs).toHaveLength(2); // retried at ~30 s
    expect(scheduler.getState().failures).toBe(2);

    await advance(59_000);
    expect(runs).toHaveLength(2);
    setFail(false);
    await advance(1_500);
    expect(runs).toHaveLength(3); // retried at ~60 s, and it worked
    expect(scheduler.getState()).toMatchObject({ failures: 0, lastError: null });
    await advance(600_000);
    expect(runs).toHaveLength(3);
  });

  it('caps the backoff at 5 minutes', async () => {
    const { scheduler, runs, setFail } = setup();
    setFail(true);
    scheduler.trigger('manual');
    for (let i = 0; i < 8; i++) await advance(5 * 60_000 + 1_000);
    const before = runs.length;
    await advance(5 * 60_000 + 1_000);
    expect(runs.length).toBe(before + 1); // one retry per 5 minutes, never slower
  });

  it('automatic triggers wait out a backoff, but opening the app and Sync now do not', async () => {
    const { scheduler, runs, setFail } = setup();
    setFail(true);
    scheduler.trigger('manual');
    await advance(1);
    expect(runs).toHaveLength(1);

    scheduler.notifyChange();
    await advance(11_000); // debounce passed, backoff (30 s) has not
    expect(runs).toHaveLength(1);

    scheduler.trigger('open');
    await advance(1);
    expect(runs).toHaveLength(2);
  });
});

describe('polling', () => {
  it('checks for other devices\' changes while visible, and not while hidden', async () => {
    let visible = true;
    const { scheduler, runs } = setup({ pollMs: 300_000, isVisible: () => visible });
    await advance(300_100);
    expect(runs).toEqual(['poll']);
    visible = false;
    await advance(300_000);
    expect(runs).toEqual(['poll']);
    visible = true;
    await advance(300_000);
    expect(runs).toEqual(['poll', 'poll']);
    scheduler.dispose();
  });
});

describe('dispose', () => {
  it('cancels anything pending and ignores later triggers', async () => {
    const { scheduler, runs } = setup({ pollMs: 1_000 });
    scheduler.notifyChange();
    scheduler.dispose();
    scheduler.trigger('manual');
    await advance(600_000);
    expect(runs).toEqual([]);
  });
});

describe('state', () => {
  it('tells subscribers when a run starts and ends', async () => {
    const { scheduler } = setup();
    const seen: boolean[] = [];
    scheduler.subscribe((s) => seen.push(s.running));
    scheduler.trigger('manual');
    await advance(1);
    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
    expect(scheduler.getState().lastRunAt).not.toBeNull();
  });
});
