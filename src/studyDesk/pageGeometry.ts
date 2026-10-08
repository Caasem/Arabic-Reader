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

/** The clean-text place under a point (a zero-length place), or null. */
export function cleanLocationAt(x: number, y: number): string | null {
  const pos = caretAt(x, y);
  const section = pos?.node.parentElement?.closest<HTMLElement>('.qr-chapter');
  if (!pos || !section) return null;
  const at = offsetWithin(section, pos.node, pos.offset);
  return formatCleanLocation({ chapter: Number(section.dataset.chapter), start: at, end: at });
}
