import type { NodeAnchor } from './types';

/**
 * The arithmetic of anchors, apart from the DOM (anchorDom.ts finds the word or page frame on screen; these turn
 * that into a screen point and back). A node's own screen point is where its dot is.
 */

/** A PDF page is this wide in page units at every zoom. */
export const PDF_UNITS = 1000;
/** Furthest from the page a node may sit, in page units: roomy margins, but never lost off in space. */
export const PDF_REACH = 1400;

export interface Point {
  x: number;
  y: number;
}
export interface FrameRect {
  left: number;
  top: number;
  width: number;
}

const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A PDF anchor on screen, given where its page is drawn. */
export function pdfToScreen(a: { x: number; y: number }, frame: FrameRect): Point {
  const k = frame.width / PDF_UNITS;
  return { x: frame.left + a.x * k, y: frame.top + a.y * k };
}

/** The PDF place of a screen point, on the page drawn in `frame`. */
export function screenToPdf(p: Point, frame: FrameRect): { x: number; y: number } {
  const k = PDF_UNITS / Math.max(1, frame.width);
  return { x: r2(clampReach((p.x - frame.left) * k)), y: r2(clampReach((p.y - frame.top) * k)) };
}

const clampReach = (n: number) => Math.min(PDF_REACH, Math.max(-PDF_REACH, finite(n)));

/** A clean-text anchor on screen: the anchor word's corner, then dx/dy in em. */
export function cleanToScreen(a: { dx: number; dy: number }, corner: Point, em: number): Point {
  return { x: corner.x + a.dx * em, y: corner.y + a.dy * em };
}

/** The dx/dy (em) that put a node at a screen point, measured from a word's corner. */
export function screenToClean(p: Point, corner: Point, em: number): { dx: number; dy: number } {
  const k = 1 / Math.max(1, em);
  return { dx: r2((p.x - corner.x) * k), dy: r2((p.y - corner.y) * k) };
}

export function sameAnchor(a: NodeAnchor | undefined, b: NodeAnchor | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A readable name for where a node is, for the node list. */
export function describeAnchor(a: NodeAnchor | undefined): string {
  if (!a) return '';
  return a.kind === 'pdf' ? `Page ${a.page}` : `Chapter ${a.chapter + 1}`;
}
