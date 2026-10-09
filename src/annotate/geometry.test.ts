import { describe, expect, it } from 'vitest';
import { borderPoint, contentBox, hitStroke, pathD, pressureWidth, segDist, sketchForPassage } from './geometry';

describe('pathD', () => {
  it('draws a dot for one point and curves through midpoints', () => {
    expect(pathD([[1, 2]])).toBe('M1 2l0.01 0');
    expect(pathD([[0, 0], [10, 0], [20, 10]])).toBe('M0 0Q10 0 15 5L20 10');
    expect(pathD([])).toBe('');
  });
});

describe('hit testing', () => {
  it('measures distance to a segment', () => {
    expect(segDist(5, 3, [0, 0], [10, 0])).toBe(3);
    expect(segDist(-4, 3, [0, 0], [10, 0])).toBe(5);
  });
  it('touches a stroke within the radius plus half its width', () => {
    const pts = [[0, 0], [100, 0]];
    expect(hitStroke(pts, 4, 50, 9, 8)).toBe(true);
    expect(hitStroke(pts, 4, 50, 11, 8)).toBe(false);
    expect(hitStroke([[5, 5]], 2, 6, 6, 1)).toBe(true);
  });
});

describe('pressureWidth', () => {
  it('keeps the width for a mouse and scales it with pen pressure', () => {
    expect(pressureWidth(3, [[0, 0, 0.5]], false)).toBe(3);
    expect(pressureWidth(2, [[0, 0, 1], [1, 1, 1]], true)).toBe(2.9);
    expect(pressureWidth(2, [[0, 0, 0]], true)).toBe(1.1);
  });
});

describe('boxes', () => {
  it('bounds strokes and nodes together', () => {
    expect(contentBox([{ pts: [[10, 20], [30, 5]] }], [{ x: 0, y: 40, w: 10, h: 10 }])).toEqual({ x: 0, y: 5, w: 30, h: 45 });
    expect(contentBox([], [])).toBeNull();
  });
  it('leaves a box on the side facing the other', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 300, y: 0, w: 100, h: 50 };
    expect(borderPoint(a, b)).toEqual([100, 25]);
    expect(borderPoint(b, a, 4)).toEqual([296, 25]);
  });
});

describe('sketchForPassage', () => {
  const sketches = [
    { id: 'a', location: 'clean:2:100:400' },
    { id: 'b', location: 'clean:2:900:1200' },
    { id: 'c', location: 'clean:3:0:300' },
    { id: 'p', location: 'pdf:4' },
  ];
  it('finds the sketch started inside the visible range', () => {
    expect(sketchForPassage(sketches, 2, 800, 1500)?.id).toBe('b');
    expect(sketchForPassage(sketches, 3, 0, 50)?.id).toBe('c');
  });
  it('keeps a sketch whose passage still overlaps the top of the screen', () => {
    expect(sketchForPassage(sketches, 2, 300, 700)?.id).toBe('a');
  });
  it('finds nothing for a passage without one', () => {
    expect(sketchForPassage(sketches, 2, 500, 800)).toBeUndefined();
    expect(sketchForPassage(sketches, 9, 0, 10)).toBeUndefined();
  });
});
