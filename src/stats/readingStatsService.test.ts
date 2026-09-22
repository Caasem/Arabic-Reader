import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { computeStreak, rangeToBounds } from './readingStatsService';

// Tests run in America/New_York (see vitest.config.ts); DST began 2026-03-08.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('computeStreak', () => {
  it('counts a run that crosses a DST change', () => {
    const days = new Set(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09']);
    expect(computeStreak(days, at(2026, 3, 9))).toEqual({ current: 4, longest: 4 });
  });

  it('keeps the current streak alive until today is over', () => {
    const days = new Set(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(computeStreak(days, at(2026, 3, 10)).current).toBe(3);
    expect(computeStreak(days, at(2026, 3, 11)).current).toBe(0);
  });

  it('finds the longest run anywhere in history', () => {
    const days = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-10', '2026-02-11']);
    expect(computeStreak(days, at(2026, 2, 11))).toEqual({ current: 2, longest: 3 });
    expect(computeStreak(new Set(), at(2026, 2, 11))).toEqual({ current: 0, longest: 0 });
  });
});

describe('rangeToBounds', () => {
  it('starts ranges at local midnight N calendar days back, even across DST', () => {
    const now = at(2026, 3, 9, 15);
    expect(rangeToBounds('today', now).since).toBe(new Date(2026, 2, 9).getTime());
    expect(rangeToBounds('week', now).since).toBe(new Date(2026, 2, 3).getTime());
    expect(rangeToBounds('all', now)).toEqual({});
  });
});
