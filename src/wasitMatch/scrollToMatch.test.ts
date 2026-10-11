import { describe, expect, it } from 'vitest';
import { scrollTopFor } from './scrollToMatch';

describe('scrollTopFor', () => {
  const container = { top: 100, bottom: 500 };

  it('leaves a match that is already in view alone', () => {
    expect(scrollTopFor(container, { top: 120, bottom: 160 }, 0)).toBeNull();
    expect(scrollTopFor(container, { top: 100, bottom: 500 }, 40)).toBeNull();
  });

  it('brings a match below the view up, a little context above it', () => {
    // 900px below the container top, already scrolled 50: lands 48px under the top.
    expect(scrollTopFor(container, { top: 1000, bottom: 1040 }, 50)).toBe(50 + 900 - 48);
    expect(scrollTopFor(container, { top: 480, bottom: 520 }, 0, 20)).toBe(360);
  });

  it('scrolls back up to a match above the view, never past the top', () => {
    expect(scrollTopFor(container, { top: 20, bottom: 60 }, 300)).toBe(300 - 80 - 48);
    expect(scrollTopFor(container, { top: 90, bottom: 130 }, 5)).toBe(0);
  });
});
