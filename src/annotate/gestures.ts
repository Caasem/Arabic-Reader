/**
 * Ink gestures (docs/features/ink-sketch-next.md, B): decides whether a finished stroke over the reader's text
 * is an underline, a circle around one word, or a tick, from the stroke alone and the boxes of the words near
 * it. Pure geometry, in one coordinate space (the screen's pixels, say), so it is easy to test. Everything is
 * measured against the words' own height, so it does not depend on the font size or zoom.
 */

export type GesturePoint = readonly number[];

/** One word on screen: where it is, and which characters of its chapter it covers. */
export interface WordBox {
  chapter: number;
  /** Character offsets into the chapter's text. */
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Gesture =
  | { kind: 'underline'; chapter: number; start: number; end: number }
  | { kind: 'circle'; word: WordBox }
  | { kind: 'tick' }
  | null;

// --- Thresholds (all lengths are in word heights, "h") --------------------------------------------------

/** An underline is at least this long... */
export const UNDERLINE_MIN_WIDTH = 1.2;
/** ...and wobbles up and down by no more than this (a wavy line is fine, a scribble is not). */
export const UNDERLINE_MAX_WOBBLE = 0.45;
/** At least this share of the stroke's horizontal movement goes one way (a back-and-forth scribble fails). */
export const UNDERLINE_MIN_DIRECTION = 0.85;
/** It runs no longer than this times its width (no loops or zigzags). */
export const UNDERLINE_MAX_SLACK = 1.6;
/** A word is underlined when the line passes this far down the word's box (0 = top, 1 = bottom)... */
export const UNDERLINE_BAND_TOP = 0.7;
/** ...and no further below the word than this. */
export const UNDERLINE_BAND_BELOW = 0.9;
/** A word counts as underlined when the stroke covers this share of its width. */
export const UNDERLINE_MIN_COVER = 0.5;

/** A circle turns through at least this much, in radians (about 270 degrees), all the same way. */
export const CIRCLE_MIN_TURN = 4.7;
/** Its ends meet within this share of its diameter. */
export const CIRCLE_MAX_GAP = 0.35;
/** The loop is no flatter than this (short side over long side). */
export const CIRCLE_MIN_ROUNDNESS = 0.3;
/** At least this much of the word's box lies inside the loop. */
export const CIRCLE_MIN_ENCLOSED = 0.75;
/** The loop reaches no further than this beyond the word it surrounds (sides, then height). */
export const CIRCLE_MAX_EXTRA_WIDTH = 3;
export const CIRCLE_MAX_HEIGHT = 4;
/** The turning is no more than this times its net, so a wiggle is not a circle. */
export const CIRCLE_MAX_WIGGLE = 1.5;

/** A tick is short (this long at most, in word heights of path)... */
export const TICK_MAX_LENGTH = 3.5;
/** ...each of its two legs at least this long... */
export const TICK_MIN_LEG = 0.25;
/** ...the corner sits between these shares of the way along... */
export const TICK_CORNER_FROM = 0.15;
export const TICK_CORNER_TO = 0.7;
/** ...the legs open at an angle between these (degrees)... */
export const TICK_MIN_ANGLE = 25;
export const TICK_MAX_ANGLE = 100;
/** ...the end rises at least this far above the corner... */
export const TICK_MIN_RISE = 0.3;
/** ...and each leg is straight to within this share of its length. */
export const TICK_MAX_BEND = 0.25;
/** The second leg is at least this much longer than the first. */
export const TICK_MIN_LEG_RATIO = 1;

/** A tick follows a circle within this long, and lies within this many word heights of the circled word. */
export const TICK_WINDOW_MS = 1500;
export const TICK_REACH = 3;

// --- Helpers --------------------------------------------------------------------------------------------

const dist = (a: GesturePoint, b: GesturePoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Drops points closer than `step` to the last kept one, so hand jitter does not count as turning. */
function thin(pts: readonly GesturePoint[], step: number): GesturePoint[] {
  const out: GesturePoint[] = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) >= step) out.push(p);
  const last = pts[pts.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

function pathLength(pts: readonly GesturePoint[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

function bounds(pts: readonly GesturePoint[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Signed and absolute turning along the path, in radians. */
function turning(pts: readonly GesturePoint[]): { net: number; total: number } {
  let net = 0;
  let total = 0;
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
    const a2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    net += d;
    total += Math.abs(d);
  }
  return { net, total };
}

/** How far the points stray from the straight line between the first and last, over that line's length. */
function bend(pts: readonly GesturePoint[]): number {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = dist(a, b);
  if (!len) return Infinity;
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len);
  return worst / len;
}

// --- The gestures ---------------------------------------------------------------------------------------

export function isTick(pts: readonly GesturePoint[], h: number): boolean {
  if (pts.length < 3 || h <= 0) return false;
  const p = thin(pts, h * 0.08);
  if (p.length < 3 || pathLength(p) > TICK_MAX_LENGTH * h) return false;
  // The corner is the lowest point on screen (largest y).
  let m = 0;
  for (let i = 0; i < p.length; i++) if (p[i][1] > p[m][1]) m = i;
  if (m === 0 || m === p.length - 1) return false;
  const total = pathLength(p);
  const along = pathLength(p.slice(0, m + 1)) / total;
  if (along < TICK_CORNER_FROM || along > TICK_CORNER_TO) return false;
  const start = p[0];
  const low = p[m];
  const end = p[p.length - 1];
  const d1 = dist(start, low);
  const d2 = dist(low, end);
  if (d1 < TICK_MIN_LEG * h || d2 < TICK_MIN_LEG * h || d2 < d1 * TICK_MIN_LEG_RATIO) return false;
  if (low[1] - end[1] < TICK_MIN_RISE * h) return false;
  const cos = ((start[0] - low[0]) * (end[0] - low[0]) + (start[1] - low[1]) * (end[1] - low[1])) / (d1 * d2);
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  if (angle < TICK_MIN_ANGLE || angle > TICK_MAX_ANGLE) return false;
  return bend(p.slice(0, m + 1)) <= TICK_MAX_BEND && bend(p.slice(m)) <= TICK_MAX_BEND;
}

function circledWord(pts: readonly GesturePoint[], words: readonly WordBox[], h: number): WordBox | null {
  const p = thin(pts, h * 0.12);
  if (p.length < 8) return null;
  const box = bounds(p);
  const diameter = Math.max(box.w, box.h);
  if (!diameter || Math.min(box.w, box.h) / diameter < CIRCLE_MIN_ROUNDNESS) return null;
  if (dist(p[0], p[p.length - 1]) > CIRCLE_MAX_GAP * diameter) return null;
  const { net, total } = turning(p);
  if (Math.abs(net) < CIRCLE_MIN_TURN || total > Math.abs(net) * CIRCLE_MAX_WIGGLE) return null;
  const enclosed: WordBox[] = [];
  for (const w of words) {
    const ix = Math.min(w.x + w.w, box.x1) - Math.max(w.x, box.x0);
    const iy = Math.min(w.y + w.h, box.y1) - Math.max(w.y, box.y0);
    if (ix <= 0 || iy <= 0) continue;
    if ((ix * iy) / (w.w * w.h) >= CIRCLE_MIN_ENCLOSED) enclosed.push(w);
  }
  if (enclosed.length !== 1) return null;
  const word = enclosed[0];
  if (box.w > word.w + CIRCLE_MAX_EXTRA_WIDTH * h || box.h > CIRCLE_MAX_HEIGHT * h) return null;
  return word;
}

function underlinedWords(pts: readonly GesturePoint[], words: readonly WordBox[], h: number): { chapter: number; start: number; end: number } | null {
  const p = thin(pts, h * 0.1);
  if (p.length < 3) return null;
  const box = bounds(p);
  if (box.w < UNDERLINE_MIN_WIDTH * h || box.h > UNDERLINE_MAX_WOBBLE * h) return null;
  if (pathLength(p) > UNDERLINE_MAX_SLACK * box.w) return null;
  let net = 0;
  let sum = 0;
  for (let i = 1; i < p.length; i++) {
    net += p[i][0] - p[i - 1][0];
    sum += Math.abs(p[i][0] - p[i - 1][0]);
  }
  if (!sum || Math.abs(net) / sum < UNDERLINE_MIN_DIRECTION) return null;
  const midY = p.reduce((s, q) => s + q[1], 0) / p.length;
  // The words the line runs under; the line it belongs to is the one whose words it sits lowest on.
  const under = words.filter((w) => {
    if (midY < w.y + UNDERLINE_BAND_TOP * w.h || midY > w.y + w.h + UNDERLINE_BAND_BELOW * w.h) return false;
    const cover = Math.min(w.x + w.w, box.x1) - Math.max(w.x, box.x0);
    return cover >= UNDERLINE_MIN_COVER * w.w;
  });
  if (!under.length) return null;
  const chapter = under[0].chapter;
  const same = under.filter((w) => w.chapter === chapter);
  return { chapter, start: Math.min(...same.map((w) => w.start)), end: Math.max(...same.map((w) => w.end)) };
}

/**
 * What a finished stroke is, given the word boxes near it (in the same coordinates as the points), or null for
 * ordinary ink. A tick is reported on its own; the caller decides whether a circle came just before it.
 */
export function classifyStroke(pts: readonly GesturePoint[], words: readonly WordBox[]): Gesture {
  if (pts.length < 3 || !words.length) {
    // Sizes are measured against the words, so with none nearby there is nothing to judge by.
    return null;
  }
  const h = median(words.map((w) => w.h));
  if (h <= 0) return null;
  if (isTick(pts, h)) return { kind: 'tick' };
  const word = circledWord(pts, words, h);
  if (word) return { kind: 'circle', word };
  const run = underlinedWords(pts, words, h);
  return run ? { kind: 'underline', ...run } : null;
}
