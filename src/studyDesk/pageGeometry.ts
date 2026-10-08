import { formatCleanLocation, parseCleanLocation } from '../quietReader/location';
import { caretAt, offsetWithin, rangeAt } from '../quietReader/textOffsets';

/**
 * Reading the open page without touching the readers: the quiet reader renders each chapter as
 * `.qr-chapter[data-chapter]` with Arabic words in `.ar-word` spans, and the PDF pages view renders each
 * page as `.pdfp-page[data-page]` with a canvas and a text layer. Everything here works from those.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const intersects = (r: DOMRect, b: Box) => r.width + r.height > 0 && r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;

export interface TextRegion {
  text: string;
  location: string;
  chapter: number;
  /** The words inside, to mark while the capture bar is open. */
  words: HTMLElement[];
}

/** The quiet reader's text inside a box on screen, as one clean-text place. */
export function textInBox(box: Box): TextRegion | null {
  const words = Array.from(document.querySelectorAll<HTMLElement>('.qr-chapter .ar-word')).filter((w) => intersects(w.getBoundingClientRect(), box));
  let section: HTMLElement | null = null;
  let start = -1;
  let end = -1;
  if (words.length) {
    section = words[0].closest<HTMLElement>('.qr-chapter');
    const same = words.filter((w) => w.closest('.qr-chapter') === section);
    if (!section) return null;
    start = Math.min(...same.map((w) => offsetWithin(section!, w, 0)));
    end = Math.max(...same.map((w) => offsetWithin(section!, w, w.childNodes.length)));
  } else {
    // No Arabic words (a Latin passage): use the text positions at the box's corners.
    const a = caretAt(box.right - 2, box.top + 2);
    const b = caretAt(box.left + 2, box.bottom - 2);
    const sa = a && (a.node.parentElement?.closest<HTMLElement>('.qr-chapter') ?? null);
    if (!a || !b || !sa || b.node.parentElement?.closest('.qr-chapter') !== sa) return null;
    section = sa;
    const x = offsetWithin(sa, a.node, a.offset);
    const y = offsetWithin(sa, b.node, b.offset);
    start = Math.min(x, y);
    end = Math.max(x, y);
  }
  if (!section || end <= start) return null;
  const chapter = Number(section.dataset.chapter);
  const text = rangeAt(section, start, end)?.toString().replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return null;
  return { text, location: formatCleanLocation({ chapter, start, end }), chapter, words };
}

export interface PdfRegion {
  page: number;
  /** "pdf:<page>:<x>:<y>:<w>:<h>", fractions of the page. */
  location: string;
  text: string;
  image: Blob | null;
}

const PDF_PREFIX = 'pdf:';

export function formatPdfLocation(page: number, x: number, y: number, w: number, h: number): string {
  const f = (n: number) => Math.max(0, Math.min(1, n)).toFixed(4);
  return `${PDF_PREFIX}${page}:${f(x)}:${f(y)}:${f(w)}:${f(h)}`;
}

export function parsePdfLocation(value: string | undefined): { page: number; x: number; y: number; w: number; h: number } | null {
  if (!value?.startsWith(PDF_PREFIX)) return null;
  const [page, x, y, w, h] = value.slice(PDF_PREFIX.length).split(':').map(Number);
  return [page, x, y, w, h].some((n) => !Number.isFinite(n)) ? null : { page, x, y, w, h };
}

/** A box on a PDF page: the text-layer words inside it and the region cut out of the page image. */
export async function pdfRegionInBox(box: Box): Promise<PdfRegion | null> {
  const page = Array.from(document.querySelectorAll<HTMLElement>('.pdfp-page')).find((p) => intersects(p.getBoundingClientRect(), box));
  if (!page) return null;
  const pr = page.getBoundingClientRect();
  const l = Math.max(box.left, pr.left);
  const t = Math.max(box.top, pr.top);
  const r = Math.min(box.right, pr.right);
  const b = Math.min(box.bottom, pr.bottom);
  if (r - l < 4 || b - t < 4) return null;
  const number = Number(page.dataset.page) || 1;
  const text = Array.from(page.querySelectorAll<HTMLElement>('.pdfp-text span'))
    .filter((s) => intersects(s.getBoundingClientRect(), { left: l, top: t, right: r, bottom: b }))
    .map((s) => s.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const canvas = page.querySelector<HTMLCanvasElement>('canvas');
  let image: Blob | null = null;
  if (canvas && canvas.width) {
    const cr = canvas.getBoundingClientRect();
    const sx = canvas.width / cr.width;
    const sy = canvas.height / cr.height;
    const out = document.createElement('canvas');
    out.width = Math.round((r - l) * sx);
    out.height = Math.round((b - t) * sy);
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, (l - cr.left) * sx, (t - cr.top) * sy, out.width, out.height, 0, 0, out.width, out.height);
      image = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    }
  }
  return { page: number, location: formatPdfLocation(number, (l - pr.left) / pr.width, (t - pr.top) / pr.height, (r - l) / pr.width, (b - t) / pr.height), text, image };
}

/** Screen boxes of a clean-text place, or none when that chapter is not on screen. */
export function rectsOfCleanLocation(location: string): DOMRect[] {
  const loc = parseCleanLocation(location);
  if (!loc) return [];
  const section = document.querySelector<HTMLElement>(`.qr-chapter[data-chapter="${loc.chapter}"]`);
  const range = section && rangeAt(section, loc.start, Math.max(loc.end, loc.start + 1));
  return range ? Array.from(range.getClientRects()) : [];
}

/** The quiet reader's visible column: the text column cut to the stage and the window. */
function visibleColumn(): { left: number; right: number; top: number; bottom: number } | null {
  const column = document.querySelector<HTMLElement>('.qr-column')?.getBoundingClientRect();
  const stage = document.querySelector<HTMLElement>('.qr-stage')?.getBoundingClientRect() ?? column;
  if (!column || !stage) return null;
  const top = Math.max(column.top, stage.top, 0);
  const bottom = Math.min(column.bottom, stage.bottom, window.innerHeight);
  return bottom - top < 10 ? null : { left: Math.max(column.left, stage.left), right: Math.min(column.right, stage.right), top, bottom };
}

/**
 * A clean-text place on the visible line nearest a screen height (a zero-length place at the start of a word
 * on that line), or null when no line is within `reach` px. Measured from the words on screen rather than
 * the caret under a point: below the last line the caret lands at the end of the chapter, which has no line.
 */
export function cleanLocationNearY(y: number, reach = Infinity): string | null {
  const col = visibleColumn();
  if (!col) return null;
  let best: { word: HTMLElement; d: number; x: number } | null = null;
  for (const word of Array.from(document.querySelectorAll<HTMLElement>('.qr-chapter .ar-word'))) {
    const r = word.getBoundingClientRect();
    if (!r.width || r.bottom < col.top || r.top > col.bottom || r.right < col.left || r.left > col.right) continue;
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    // Same line: keep the rightmost word (the line's start in Arabic).
    if (!best || d < best.d - 1 || (Math.abs(d - best.d) <= 1 && r.right > best.x)) best = { word, d, x: r.right };
  }
  if (best) {
    if (best.d > reach) return null;
    const section = best.word.closest<HTMLElement>('.qr-chapter');
    if (!section) return null;
    const at = offsetWithin(section, best.word, 0);
    return formatCleanLocation({ chapter: Number(section.dataset.chapter), start: at, end: at });
  }
  // No Arabic words on screen (a Latin passage): the caret at that height, kept only if it is on a visible line.
  for (const x of [col.left + (col.right - col.left) / 2, col.right - 12, col.left + 12]) {
    const at = cleanLocationAt(x, y);
    const r = at ? rectsOfCleanLocation(at)[0] : undefined;
    if (at && r && r.bottom >= col.top && r.top <= col.bottom && Math.abs(r.top + r.height / 2 - y) <= Math.min(reach, 60)) return at;
  }
  return null;
}

/** A clean-text place on the visible line nearest the middle of the column, for things placed on "this page" (Pull in). */
export function cleanLocationNearCentre(): string | null {
  const col = visibleColumn();
  return col ? cleanLocationNearY((col.top + col.bottom) / 2) : null;
}

/** The clean-text place under a point (a zero-length place), or null. */
export function cleanLocationAt(x: number, y: number): string | null {
  const pos = caretAt(x, y);
  const section = pos?.node.parentElement?.closest<HTMLElement>('.qr-chapter');
  if (!pos || !section) return null;
  const at = offsetWithin(section, pos.node, pos.offset);
  return formatCleanLocation({ chapter: Number(section.dataset.chapter), start: at, end: at });
}

/**
 * A level on a PDF page under a screen height: `pdf:<page>:0:<y>:1:0`, a whole-width line of no height (a
 * margin note's place, where a captured region has a real box). The nearest page when y falls between pages.
 */
export function pdfLevelAt(y: number): string | null {
  let best: { page: HTMLElement; r: DOMRect; d: number } | null = null;
  for (const page of Array.from(document.querySelectorAll<HTMLElement>('.pdfp-page[data-page]'))) {
    const r = page.getBoundingClientRect();
    if (!r.height) continue;
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (!best || d < best.d) best = { page, r, d };
    if (!d) break;
  }
  if (!best || best.d > 80) return null;
  const n = Number(best.page.dataset.page) || 1;
  return formatPdfLocation(n, 0, (y - best.r.top) / best.r.height, 1, 0);
}

/** A level near the middle of the PDF pages on screen, for things placed on "this page" (Pull in). */
export function pdfLocationNearCentre(): string | null {
  const stage = document.querySelector<HTMLElement>('.pdfp__stage')?.getBoundingClientRect();
  if (!stage || stage.height < 10) return null;
  return pdfLevelAt(stage.top + stage.height / 2);
}
