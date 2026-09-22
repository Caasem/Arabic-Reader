import { describe, expect, it } from 'vitest';
import { anchoredPosition, clampX } from './anchoredPosition';

const viewport = { width: 400, height: 800 };
const options = { halfWidth: 120, flipBelowY: 100 };

describe('clampX', () => {
  it('keeps the element inside both edges', () => {
    expect(clampX(10, 120, 400)).toBe(120);
    expect(clampX(390, 120, 400)).toBe(280);
    expect(clampX(200, 120, 400)).toBe(200);
  });
});

describe('anchoredPosition', () => {
  it('sits above an anchor with room above it', () => {
    expect(anchoredPosition(200, 300, options, viewport)).toEqual({ left: 200, top: 300, below: false });
  });

  it('flips below an anchor near the top of the screen', () => {
    expect(anchoredPosition(200, 50, options, viewport)).toEqual({ left: 200, top: 50, below: true });
  });

  it('keeps room under the anchor at the bottom of the screen', () => {
    expect(anchoredPosition(200, 795, options, viewport).top).toBe(780);
    expect(anchoredPosition(200, 795, { ...options, flipBelowY: 900 }, viewport).top).toBe(760);
  });
});
