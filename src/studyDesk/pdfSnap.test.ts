import { describe, expect, it } from 'vitest';
import { readingOrder, unionBox, wordsInside, type SnapWord } from './pdfSnap';

const w = (text: string, x: number, y: number, ww = 0.1, h = 0.03): SnapWord => ({ text, x, y, w: ww, h });

describe('snapping a drag to words', () => {
  const words = [w('كان', 0.8, 0.1), w('هناك', 0.65, 0.1), w('رجل', 0.5, 0.102), w('قوي', 0.8, 0.15), w('outside', 0.1, 0.5)];

  it('keeps the words whose middle is inside the drag', () => {
    expect(wordsInside(words, { x: 0.45, y: 0.08, w: 0.5, h: 0.12 }).map((x) => x.text)).toEqual(['كان', 'هناك', 'رجل', 'قوي']);
  });

  it('reads Arabic lines top to bottom, right to left', () => {
    expect(readingOrder(words.slice(0, 4), true)).toBe('كان هناك رجل\nقوي');
    expect(readingOrder([w('world', 0.5, 0.1), w('hello', 0.2, 0.1)], false)).toBe('hello world');
  });

  it('snaps the box around the words', () => {
    const b = unionBox(words.slice(0, 4))!;
    expect(b.x).toBeCloseTo(0.5);
    expect(b.y).toBeCloseTo(0.1);
    expect(b.x + b.w).toBeCloseTo(0.9);
    expect(b.y + b.h).toBeCloseTo(0.18);
    expect(unionBox([])).toBeNull();
  });
});
