import { parseCleanLocation } from '../quietReader/location';
import type { InkPoint } from './types';

/** Rounded to a tenth: plenty for strokes, and keeps stored rows small. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;
/** Rounded to a thousandth, for em units (a word is a few em wide). */
export const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A smooth SVG path through the points (quadratic curves through the midpoints). */
export function pathD(pts: readonly (readonly number[])[]): string {
  if (!pts.length) return '';
  const p0 = pts[0];
  if (pts.length === 1) return `M${p0[0]} ${p0[1]}l0.01 0`;
  let d = `M${p0[0]} ${p0[1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    d += `Q${a[0]} ${a[1]} ${r3((a[0] + b[0]) / 2)} ${r3((a[1] + b[1]) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${last[0]} ${last[1]}`;
}

/** Distance from a point to the segment a-b. */
export function segDist(px: number, py: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Whether a point within `radius` of the stroke's line touches it. */
export function hitStroke(pts: readonly (readonly number[])[], width: number, x: number, y: number, radius: number): boolean {
  const lim = radius + width / 2;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) < lim;
  for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1], pts[i]) < lim) return true;
  return false;
}

/** A pen's line gets wider the harder it presses; a mouse or finger keeps the chosen width. */
export function pressureWidth(base: number, pts: readonly InkPoint[], pen: boolean): number {
  if (!pen || !pts.length) return base;
  const avg = pts.reduce((s, p) => s + p[2], 0) / pts.length;
  return r3(base * (0.55 + avg * 0.9));
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest box around the strokes' points and the nodes, or null for an empty sheet. */
export function contentBox(strokes: readonly { pts: readonly (readonly number[])[] }[], nodes: readonly Box[]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w);
    y1 = Math.max(y1, n.y + n.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Where the line from a's centre to b's centre leaves a's box, `gap` further on. */
export function borderPoint(a: Box, b: Box, gap = 0): [number, number] {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const dx = b.x + b.w / 2 - cx;
  const dy = b.y + b.h / 2 - cy;
  const t = Math.min(a.w / 2 / (Math.abs(dx) || 1e-9), a.h / 2 / (Math.abs(dy) || 1e-9));
  const g = gap / (Math.hypot(dx, dy) || 1);
  return [r1(cx + dx * (t + g)), r1(cy + dy * (t + g))];
}

/**
 * The sketch for the passage on screen in the clean reader: the first one started inside the visible range of
 * the chapter, or failing that the one started nearest before it on the same chapter, if still in view.
 */
export function sketchForPassage<T extends { location: string }>(sketches: readonly T[], chapter: number, start: number, end: number): T | undefined {
  let best: T | undefined;
  let bestAt = -1;
  for (const s of sketches) {
    const at = parseCleanLocation(s.location);
    if (!at || at.chapter !== chapter) continue;
    if (at.start >= start && at.start <= end) return s;
    // A sketch started a little before what is on screen still belongs here while its passage overlaps.
    if (at.start < start && at.end >= start && at.start > bestAt) {
      best = s;
      bestAt = at.start;
    }
  }
  return best;
}
