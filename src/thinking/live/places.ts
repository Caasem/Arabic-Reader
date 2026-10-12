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
