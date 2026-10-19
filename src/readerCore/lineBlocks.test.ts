import { describe, expect, it } from 'vitest';
import { lineBlocks } from './lineBlocks';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('lineBlocks', () => {
  it('merges the word boxes of one line, uneven heights and gaps included, into one block', () => {
    const words = [box(0, 10, 40, 50), box(44, 14, 80, 52), box(84, 12, 120, 48)];
    expect(lineBlocks(words, null)).toEqual([box(0, 10, 120, 52)]);
  });
  it('keeps separate lines apart and in order', () => {
    const out = lineBlocks([box(0, 110, 50, 150), box(0, 10, 50, 50)], null);
    expect(out).toHaveLength(2);
    expect(out[0].top).toBe(10);
    expect(out[1].top).toBe(110);
  });
  it('with a line height, blocks are that tall around the text, so wrapped lines meet', () => {
    const out = lineBlocks([box(0, 10, 50, 50), box(0, 110, 50, 150)], 100);
    expect(out[0].bottom).toBe(out[1].top);
    expect(out[0].bottom - out[0].top).toBe(100);
  });
  it('ignores empty boxes', () => {
    expect(lineBlocks([box(5, 5, 5, 20), box(0, 0, 10, 10)], null)).toEqual([box(0, 0, 10, 10)]);
    expect(lineBlocks([], 40)).toEqual([]);
  });
  it('reads boxes whose fields are getters, as a DOMRect has them', () => {
    class Rect {
      v: [number, number, number, number];
      constructor(v: [number, number, number, number]) {
        this.v = v;
      }
      get left() { return this.v[0]; }
      get top() { return this.v[1]; }
      get right() { return this.v[2]; }
      get bottom() { return this.v[3]; }
    }
    const out = lineBlocks([new Rect([0, 10, 40, 50]), new Rect([44, 12, 80, 52])], null);
    expect(out).toEqual([box(0, 10, 80, 52)]);
    expect(out.every((b) => Number.isFinite(b.left) && Number.isFinite(b.top))).toBe(true);
  });
});
