// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeCtc, reverseGraphemes } from './ctc';
import { findLine, inkThreshold, wordSegments } from './lines';
import { lineTensor } from './paddleEngine';

describe('reverseGraphemes', () => {
  it('turns a word round but keeps vowel marks on their letters', () => {
    expect(reverseGraphemes('كتب')).toBe('بتك');
    expect(reverseGraphemes('كَتَبَ')).toBe('بَتَكَ');
    expect(reverseGraphemes('')).toBe('');
  });
});

describe('decodeCtc', () => {
  // Classes: 0 blank, 1..3 = table letters, 4 = space (table of 3 plus two).
  const charset = ['ب', 'ت', 'ك'];
  const steps = (...classes: number[]) => {
    const scores = new Float32Array(classes.length * 5);
    classes.forEach((c, t) => (scores[t * 5 + c] = 1));
    return scores;
  };
  it('collapses repeats, drops blanks, splits at spaces and turns each word round', () => {
    // image order "ب ب blank ت ، space، ك" → words "بت" and "ك", each reversed
    const words = decodeCtc(steps(1, 1, 0, 2, 4, 3, 3), 7, 5, charset);
    expect(words.map((w) => w.text)).toEqual(['تب', 'ك']);
    expect(words[0]).toMatchObject({ start: 0, end: 3 });
    expect(words[1]).toMatchObject({ start: 5, end: 6 });
  });
  it('reads an empty or all-blank line as no words', () => {
    expect(decodeCtc(steps(0, 0, 0), 3, 5, charset)).toEqual([]);
  });
  it('repeats separated by a blank are two letters', () => {
    expect(decodeCtc(steps(1, 0, 1), 3, 5, charset).map((w) => w.text)).toEqual(['بب']);
  });
});

/** A white image with black rectangles, as [x, y, w, h]. */
function image(width: number, height: number, inks: number[][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (const [x, y, w, h] of inks) for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) data[r * width + c] = 20;
  return data;
}

describe('finding the line at the tap', () => {
  const W = 400;
  const H = 120;
  const gray = image(W, H, [
    [50, 10, 300, 20], // line one
    [50, 80, 300, 20], // line two
  ]);
  it('picks the line the tap is on, else the nearest', () => {
    expect(findLine(gray, W, H, 18)).toMatchObject({ top: 10, bottom: 30, left: 50, right: 350 });
    expect(findLine(gray, W, H, 90)).toMatchObject({ top: 80, bottom: 100 });
    expect(findLine(gray, W, H, 60)).toMatchObject({ top: 80 }); // nearer to the second
  });
  it('returns null for an empty page', () => {
    expect(findLine(new Uint8ClampedArray(W * H).fill(255), W, H, 10)).toBeNull();
  });
  it('ignores specks of noise when measuring the line', () => {
    const noisy = image(W, H, [[100, 10, 200, 20], [10, 15, 2, 2], [390, 20, 2, 2]]);
    expect(findLine(noisy, W, H, 20)).toMatchObject({ left: 100, right: 300 });
  });
  it('separates ink from paper with a threshold between them', () => {
    const t = inkThreshold(gray);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(255);
  });
});

describe('word boxes from gaps in the ink', () => {
  const W = 400;
  const H = 40;
  const band = { top: 5, bottom: 35, left: 20, right: 380 };
  // three words of different widths with wide gaps, and small gaps inside the first
  const gray = image(W, H, [[20, 5, 40, 30], [66, 5, 30, 30], [130, 5, 100, 30], [300, 5, 80, 30]]);
  it('cuts at the widest gaps', () => {
    const segs = wordSegments(gray, W, band, 3)!;
    // widest two gaps are 96→130 (34) and 230→300 (70): words are [20,96] [130,230] [300,380]
    expect(segs.map((s) => [s.left, s.right])).toEqual([[20, 96], [130, 230], [300, 380]]);
  });
  it('says so when there are fewer runs than words', () => {
    expect(wordSegments(gray, W, band, 9)).toBeNull();
  });
});

describe('line tensor', () => {
  it('scales to 48 high, pads the width to a multiple of 32 and normalises to -1..1', () => {
    const gray = { data: new Uint8ClampedArray(200 * 96).fill(255), width: 200, height: 96 };
    for (let r = 0; r < 96; r++) for (let c = 0; c < 100; c++) gray.data[r * 200 + c] = 0;
    const { input, width } = lineTensor(gray, { top: 0, bottom: 96, left: 0, right: 200 });
    expect(width % 32).toBe(0);
    expect(input.length).toBe(3 * 48 * width);
    expect(Math.min(...input)).toBeCloseTo(-1);
    expect(Math.max(...input)).toBeLessThanOrEqual(1);
  });
});
