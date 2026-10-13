import { parseCleanLocation } from '../../readerCore/location';
import { parsePdfLocation } from '../../studyDesk/pageGeometry';
import type { DeskItem } from '../../studyDesk/types';

/**
 * Where a kept passage sits in a live Muqābala pane (docs/features/thinking-front.md, "Muqābala"): a span of a text
 * chapter, or a box on a PDF page. A passage kept in one view of a PDF book has no place in the other.
 */
export type LiveView = 'text' | 'pages';
export type LivePlace = { view: 'text'; chapter: number; start: number; end: number } | { view: 'pages'; page: number; x: number; y: number; w: number; h: number };

const pdfPageOnly = /^pdf:page=(\d+)/;

export function livePlace(item: DeskItem): LivePlace | null {
  const location = item.source?.location;
  const clean = parseCleanLocation(location);
  if (clean) return { view: 'text', ...clean };
  const box = parsePdfLocation(location);
  if (box) return { view: 'pages', ...box };
  // An older whole-page place: the top of the page.
  const m = pdfPageOnly.exec(location ?? '');
  return m ? { view: 'pages', page: Number(m[1]), x: 0, y: 0, w: 1, h: 0.04 } : null;
}

/** The view a pane opens in: the one its first passage needs, else the book's own choice. */
export function viewFor(item: DeskItem | undefined, fallback: LiveView): LiveView {
  const place = item ? livePlace(item) : null;
  return place?.view ?? fallback;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A selection's boxes on a page, as the fractions of the page a `pdf:` place stores; null when they miss it. */
export function boxOnPage(rects: Rect[], page: Rect): { x: number; y: number; w: number; h: number } | null {
  const width = page.right - page.left;
  const height = page.bottom - page.top;
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const x of rects) {
    const cl = Math.max(x.left, page.left);
    const ct = Math.max(x.top, page.top);
    const cr = Math.min(x.right, page.right);
    const cb = Math.min(x.bottom, page.bottom);
    if (cr - cl < 1 || cb - ct < 1) continue;
    l = Math.min(l, cl);
    t = Math.min(t, ct);
    r = Math.max(r, cr);
    b = Math.max(b, cb);
  }
  if (!(r > l && b > t) || width <= 0 || height <= 0) return null;
  return { x: (l - page.left) / width, y: (t - page.top) / height, w: (r - l) / width, h: (b - t) / height };
}

/**
 * Where a wire meets a pane: the passage's own height when it is in sight, else the pane's top or bottom edge
 * (`off`), so a link to a passage scrolled away still points the right way.
 */
export function anchorIn(y: number | null, before: boolean, top: number, bottom: number): { y: number; off: boolean } {
  const pad = 10;
  if (y === null) return { y: before ? top + pad : bottom - pad, off: true };
  if (y < top + pad) return { y: top + pad, off: true };
  if (y > bottom - pad) return { y: bottom - pad, off: true };
  return { y, off: false };
}

/**
 * Every passage clickable, as in the prototype: a block's text split into sentences, as [start, end) offsets from
 * `base`, without the spaces around them. A sentence ends after . ! ? ؟ ۔ or … (with any closing quotes or brackets)
 * when a space or the block's end follows, so "1.5" stays whole. A block with no stop is one passage.
 */
const STOP = /[.!?؟۔…]/;
const CLOSER = /["'”’»)\]}]/;

export function sentencesIn(text: string, base = 0): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const push = (a: number, b: number) => {
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b > a) out.push({ start: base + a, end: base + b });
  };
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (!STOP.test(text[i])) continue;
    let j = i + 1;
    while (j < text.length && (STOP.test(text[j]) || CLOSER.test(text[j]))) j++;
    if (j < text.length && !/\s/.test(text[j])) continue;
    push(from, j);
    from = j;
    i = j - 1;
  }
  push(from, text.length);
  return out;
}

/** True when a run of text ends a sentence (its last visible character is a stop, maybe before closing marks). */
export function endsSentence(text: string): boolean {
  const t = text.trimEnd().replace(/["'”’»)\]}]+$/, '');
  return STOP.test(t.slice(-1));
}

/**
 * On a PDF page, the runs of the text layer around run `i` that make one sentence: back to the run after the last
 * stop, forward to the next stop. It also stops at a paragraph gap (a line much further down than a line's height)
 * and after `max` runs either way, so a page without stops does not become one passage.
 */
export function runAround(runs: { text: string; top: number; height: number }[], i: number, max = 6): [number, number] {
  const gap = (a: number, b: number) => runs[b].top - runs[a].top > Math.max(runs[a].height, runs[b].height) * 1.9;
  let a = i;
  while (a > 0 && i - a < max && !endsSentence(runs[a - 1].text) && !gap(a - 1, a)) a--;
  let b = i;
  while (b < runs.length - 1 && b - i < max && !endsSentence(runs[b].text) && !gap(b, b + 1)) b++;
  return [a, b];
}
