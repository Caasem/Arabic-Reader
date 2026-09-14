import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingSessionTracker } from './ReadingSessionTracker';
import { persistenceService } from '../../persistence/db';

const T0 = 1_000_000_000;
const rowsFor = async (bookId: string) => (await persistenceService.getReadingSessions()).filter((s) => s.bookId === bookId);

describe('ReadingSessionTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('does not save a session too short to be real reading', async () => {
    const tracker = new ReadingSessionTracker('short', 'Book', 0);
    tracker.start();
    vi.advanceTimersByTime(5_000);
    await tracker.finish();
    expect(await rowsFor('short')).toEqual([]);
  });

  it('flushes a session in progress and updates the same row when it finishes', async () => {
    const tracker = new ReadingSessionTracker('flush', 'Book', 0.1);
    tracker.start();
    vi.advanceTimersByTime(20_000);
    await tracker.flush();
    let rows = await rowsFor('flush');
    expect(rows).toHaveLength(1);
    expect(rows[0].activeDurationMs).toBe(20_000);

    tracker.recordWordSeen('ch1.xhtml#0');
    tracker.recordWordSeen('ch1.xhtml#0');
    tracker.recordWordSeen('ch1.xhtml#1');
    tracker.recordLookup();
    tracker.recordPercent(0.2);
    vi.advanceTimersByTime(20_000);
    await tracker.finish();

    rows = await rowsFor('flush');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ activeDurationMs: 40_000, wordsRead: 2, lookupCount: 1, startPercent: 0.1, endPercent: 0.2 });
  });

  it('stops accruing time once the reader goes idle', async () => {
    const tracker = new ReadingSessionTracker('idle', 'Book', 0);
    tracker.start();
    vi.advanceTimersByTime(300_000); // no activity after the start
    await tracker.finish();
    const [row] = await rowsFor('idle');
    expect(row.activeDurationMs).toBe(75_000); // ticks at 15..75s fall inside the 90s idle window
  });

  it('reports a section as a first visit only once', () => {
    const tracker = new ReadingSessionTracker('visits', 'Book', 0);
    expect(tracker.isFirstVisit('ch1.xhtml')).toBe(true);
    expect(tracker.isFirstVisit('ch1.xhtml')).toBe(false);
    expect(tracker.isFirstVisit('ch2.xhtml')).toBe(true);
  });
});
