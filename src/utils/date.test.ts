import { describe, expect, it } from 'vitest';
import { addDays, dayKey, daysBetween, parseDayKey, startOfDay } from './date';

// vitest.config.ts runs tests in America/New_York; DST began 2026-03-08.
describe('date helpers', () => {
  it('parses day keys as local midnight, not UTC', () => {
    expect(parseDayKey('2026-03-08')).toBe(new Date(2026, 2, 8).getTime());
    expect(dayKey(parseDayKey('2026-11-01'))).toBe('2026-11-01');
  });

  it('adds calendar days across a DST change and lands on midnight', () => {
    const beforeDst = new Date(2026, 2, 7, 15, 30).getTime();
    expect(addDays(beforeDst, 1)).toBe(new Date(2026, 2, 8).getTime());
    expect(addDays(beforeDst, 2)).toBe(new Date(2026, 2, 9).getTime());
    expect(addDays(beforeDst, 2) - addDays(beforeDst, 1)).toBe(23 * 3_600_000);
    expect(startOfDay(beforeDst)).toBe(new Date(2026, 2, 7).getTime());
  });

  it('counts whole days between keys regardless of DST', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-01-02', '2026-01-01')).toBe(-1);
  });
});
