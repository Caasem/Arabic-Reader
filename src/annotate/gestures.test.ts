import { describe, expect, it } from 'vitest';
import { classifyStroke, type GesturePoint, type WordBox } from './gestures';

const H = 26;

/** A line of words, laid out left to right or (for Arabic) right to left, offsets running in reading order. */
function line(n: number, opts: { rtl?: boolean; y?: number; chapter?: number; startAt?: number } = {}): WordBox[] {
  const { rtl = false, y = 100, chapter = 0, startAt = 0 } = opts;
  const out: WordBox[] = [];
  const w = 60;
  const gap = 12;
  for (let i = 0; i < n; i++) {
    const x = rtl ? 600 - (i + 1) * w - i * gap : 100 + i * (w + gap);
    out.push({ chapter, start: startAt + i * 5, end: startAt + i * 5 + 4, x, y, w, h: H });
  }
  return out;
}

/** Points along straight segments, a point every 2 pixels. */
function poly(...corners: [number, number][]): GesturePoint[] {
  const pts: GesturePoint[] = [corners[0]];
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1];
    const [bx, by] = corners[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2));
    for (let k = 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return pts;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 60): GesturePoint[] {
  const pts: GesturePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

describe('classifyStroke: underline', () => {
  const words = line(5);
  const below = 100 + H * 0.95;

  it('takes a clean underline under three words', () => {
    const g = classifyStroke(poly([105, below], [100 + 3 * 72 - 10, below + 2]), words);
    expect(g).toEqual({ kind: 'underline', chapter: 0, start: 0, end: 14 });
  });

  it('takes a wavy underline', () => {
    const pts: GesturePoint[] = [];
    for (let x = 105; x <= 300; x += 3) pts.push([x, below + Math.sin(x / 9) * H * 0.2]);
    const g = classifyStroke(pts, words);
    expect(g?.kind).toBe('underline');
  });

  it('works on right-to-left lines, where offsets grow leftwards', () => {
    const rtl = line(5, { rtl: true });
    // Drawn right to left under the first two words (the rightmost).
    const g = classifyStroke(poly([590, below], [470, below]), rtl);
    expect(g).toEqual({ kind: 'underline', chapter: 0, start: 0, end: 9 });
    // And left to right under the same two.
    expect(classifyStroke(poly([470, below], [590, below]), rtl)).toEqual({ kind: 'underline', chapter: 0, start: 0, end: 9 });
  });

  it('does not take a long back-and-forth scribble across the words', () => {
    const pts = poly([105, below], [300, below], [105, below + 4], [300, below + 4], [105, below + 8], [300, below + 8]);
    expect(classifyStroke(pts, words)).toBeNull();
  });

  it('does not take a short dash inside a word', () => {
    expect(classifyStroke(poly([115, 100 + H * 0.5], [140, 100 + H * 0.5]), words)).toBeNull();
  });

  it('does not take a line through the middle of the words', () => {
    expect(classifyStroke(poly([105, 100 + H * 0.4], [300, 100 + H * 0.4]), words)).toBeNull();
  });

  it('does not take a line far below the text', () => {
    expect(classifyStroke(poly([105, 100 + H * 3], [300, 100 + H * 3]), words)).toBeNull();
  });
});

describe('classifyStroke: circle', () => {
  const words = line(5);
  const target = words[2];
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;

  it('takes a loop round one word', () => {
    const g = classifyStroke(ellipse(cx, cy, target.w / 2 + 12, target.h / 2 + 10, -2, -2 + Math.PI * 2 + 0.3), words);
    expect(g).toEqual({ kind: 'circle', word: target });
  });

  it('takes it drawn the other way, and on a right-to-left line', () => {
    const rtl = line(5, { rtl: true });
    const t = rtl[1];
    const g = classifyStroke(ellipse(t.x + t.w / 2, t.y + t.h / 2, t.w / 2 + 12, t.h / 2 + 10, 1, 1 - Math.PI * 2 - 0.3), rtl);
    expect(g).toEqual({ kind: 'circle', word: t });
  });

  it('does not take an open arc', () => {
    const arc = ellipse(cx, cy, target.w / 2 + 12, target.h / 2 + 10, -2, -2 + Math.PI * 1.5);
    expect(classifyStroke(arc, words)).toBeNull();
  });

  it('does not take a loop round two words', () => {
    const a = words[1];
    const c = (a.x + words[2].x + words[2].w) / 2;
    expect(classifyStroke(ellipse(c, cy, 80, target.h / 2 + 10, -2, -2 + Math.PI * 2 + 0.3), words)).toBeNull();
  });

  it('does not take a small loop inside a word (a handwritten o)', () => {
    expect(classifyStroke(ellipse(cx, cy, 5, 5, 0, Math.PI * 2 + 0.2), words)).toBeNull();
  });
});

describe('classifyStroke: tick', () => {
  const words = line(5);

  it('takes a check mark', () => {
    expect(classifyStroke(poly([300, 130], [308, 142], [330, 116]), words)).toEqual({ kind: 'tick' });
  });

  it('does not take a plain slash or a long hook', () => {
    expect(classifyStroke(poly([300, 140], [330, 110]), words)).toBeNull();
    expect(classifyStroke(poly([300, 80], [330, 200], [420, 90]), words)).toBeNull();
  });
});

describe('classifyStroke: ordinary handwriting', () => {
  const words = line(5);

  it('leaves a long multi-direction scribble alone', () => {
    const pts: GesturePoint[] = [];
    for (let i = 0; i < 120; i++) pts.push([150 + 60 * Math.sin(i / 4), 60 + 40 * Math.sin(i / 3.1) + i * 0.3]);
    expect(classifyStroke(pts, words)).toBeNull();
  });

  it('leaves a stroke with no words nearby alone', () => {
    expect(classifyStroke(poly([0, 0], [200, 0]), [])).toBeNull();
  });

  it('leaves a single point alone', () => {
    expect(classifyStroke([[10, 10]], words)).toBeNull();
  });
});
