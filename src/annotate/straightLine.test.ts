import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHoldDetector, createStraightTracker, straighten, straightPoints } from './straightLine';

describe('straighten', () => {
  it('snaps level within 5 degrees', () => {
    // About 3 degrees off horizontal.
    expect(straighten([0, 0], [100, 5.2])).toEqual([100, 0]);
  });
  it('does not snap at 8 degrees', () => {
    expect(straighten([0, 0], [100, 14.05])).toEqual([100, 14.05]);
  });
  it('snaps plumb', () => {
    expect(straighten([10, 10], [14, 110])).toEqual([10, 110]);
    expect(straighten([10, 110], [6, 10])).toEqual([10, 10]);
  });
  it('leaves a diagonal alone', () => {
    expect(straighten([0, 0], [50, 50])).toEqual([50, 50]);
  });
  it('snaps right-to-left strokes too', () => {
    expect(straighten([200, 50], [20, 53])).toEqual([20, 50]);
    expect(straighten([200, 50], [20, 90])).toEqual([20, 90]);
  });
  it('keeps a zero-length line', () => {
    expect(straighten([5, 5], [5, 5])).toEqual([5, 5]);
  });
});

describe('createHoldDetector', () => {
  it('fires after staying still, through jitter under the tolerance', () => {
    const h = createHoldDetector({ ms: 500, tolerancePx: 4 });
    expect(h.move(0, 0, 0)).toBe(false);
    expect(h.move(2, 1, 200)).toBe(false);
    expect(h.move(-1, 2, 400)).toBe(false);
    expect(h.move(1, 1, 520)).toBe(true);
  });
  it('resets when the pointer moves past the tolerance', () => {
    const h = createHoldDetector({ ms: 500, tolerancePx: 4 });
    h.move(0, 0, 0);
    expect(h.move(10, 0, 400)).toBe(false);
    expect(h.move(10, 1, 800)).toBe(false);
    expect(h.move(10, 1, 910)).toBe(true);
  });
  it('does not fire twice', () => {
    const h = createHoldDetector({ ms: 500, tolerancePx: 4 });
    h.move(0, 0, 0);
    expect(h.check(600)).toBe(true);
    expect(h.check(700)).toBe(false);
    expect(h.move(0, 0, 900)).toBe(false);
  });
});

describe('createStraightTracker', () => {
  afterEach(() => vi.useRealTimers());

  it('straightens on a hold, once it has gone some way', () => {
    vi.useFakeTimers();
    const onStraight = vi.fn();
    const t = createStraightTracker({ onStraight, now: () => Date.now() });
    t.start(0, 0);
    vi.advanceTimersByTime(100);
    t.move(50, 0);
    expect(t.straight).toBe(false);
    vi.advanceTimersByTime(600);
    expect(t.straight).toBe(true);
    expect(onStraight).toHaveBeenCalledTimes(1);
    t.stop();
    expect(t.straight).toBe(false);
  });
  it('ignores a hold at the start point', () => {
    vi.useFakeTimers();
    const t = createStraightTracker({ onStraight: vi.fn(), now: () => Date.now() });
    t.start(0, 0);
    vi.advanceTimersByTime(1000);
    expect(t.straight).toBe(false);
    t.stop();
  });
  it('straightens at once with Shift, and stays straight after it is released', () => {
    const t = createStraightTracker({ onStraight: vi.fn() });
    t.start(0, 0);
    t.move(10, 10, true);
    expect(t.straight).toBe(true);
    t.move(20, 20, false);
    expect(t.straight).toBe(true);
    t.stop();
  });
});

describe('straightPoints', () => {
  it('gives start and snapped end with the average pressure', () => {
    expect(
      straightPoints(
        [
          [0, 0, 0.2],
          [5, 1, 0.6],
          [9, 2, 0.4],
        ],
        [100, 3]
      )
    ).toEqual([
      [0, 0, 0.4],
      [100, 0, 0.4],
    ]);
  });
});
