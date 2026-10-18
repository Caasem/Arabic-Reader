import { caretAt, offsetWithin, rangeAt } from '../quietReader/textOffsets';
import { goToBookLocation } from '../readerChords/navigation';
import { formatCleanLocation } from '../readerCore/location';
import { PDF_UNITS, screenToClean, screenToPdf, type Point } from './anchor';
import type { NodeAnchor } from './types';

/**
 * Finding anchors on screen. Works from the readers' DOM only, as the ink layer does: the quiet reader renders each
 * chapter as `.qr-chapter[data-chapter]` inside `.qr-stage`, the PDF pages view as `.pdfp-page[data-page]` frames
 * inside `.pdfp__stage`. Nothing here edits either reader.
 */

export const findCleanStage = (): HTMLElement | null => document.querySelector<HTMLElement>('.qr .qr-stage');
export const findPdfStage = (): HTMLElement | null => document.querySelector<HTMLElement>('.pdfp__stage');

/** The text's font size in pixels: one em, the unit a clean-text node's offsets are measured in. */
export function cleanEm(stage: HTMLElement): number {
  const text = stage.querySelector('.qr-text');
  return text ? parseFloat(getComputedStyle(text).fontSize) || 22 : 22;
}

/** The top, reading-start corner (right for Arabic) of the character at `offset` in a chapter, on screen. */
export function wordCorner(section: Element, offset: number): Point | null {
  const range = rangeAt(section, offset, offset + 1);
  if (!range) return null;
  const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 || r.height > 0);
  if (!rect) return null;
  const rtl = getComputedStyle(section).direction !== 'ltr';
  return { x: rtl ? rect.right : rect.left, y: rect.top };
}

export const chapterEl = (stage: HTMLElement, chapter: number): HTMLElement | null => stage.querySelector<HTMLElement>(`.qr-chapter[data-chapter="${chapter}"]`);

/** The word under a point, or the nearest one on screen, as its chapter and offset. */
export function wordAnchorAt(stage: HTMLElement, x: number, y: number): { chapter: number; offset: number } | null {
  const sectionOf = (el: Element | null | undefined) => el?.closest<HTMLElement>('.qr-chapter') ?? null;
  const result = (section: HTMLElement, offset: number) => ({ chapter: Number(section.dataset.chapter), offset });
  const hit = document.elementsFromPoint(x, y).find((el) => stage.contains(el));
  const word = hit?.closest<HTMLElement>('.ar-word');
  const own = sectionOf(word);
  if (word && own) return result(own, offsetWithin(own, word, 0));
  // In the margin or between lines: the nearest word on screen.
  const box = stage.getBoundingClientRect();
  // Paged layout keeps the other pages beside the column, hidden by it: their words are not on screen.
  const column = stage.querySelector('.qr-column')?.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const w of stage.querySelectorAll<HTMLElement>('.qr-chapter .ar-word')) {
    const r = w.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom || r.right < box.left || r.left > box.right || !r.width) continue;
    if (column && (r.right < column.left - 2 || r.left > column.right + 2)) continue;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  const near = sectionOf(best);
  if (best && near) return result(near, offsetWithin(near, best, 0));
  // A passage with no Arabic words (Latin text): the text position under the point.
  const caret = caretAt(x, y);
  const section = sectionOf(caret?.node instanceof Element ? caret.node : caret?.node.parentElement);
  return caret && section ? result(section, offsetWithin(section, caret.node, caret.offset)) : null;
}

/** Is a word's corner in the column that is showing? (Paged layout keeps other pages beside it, hidden by it.) */
export function inColumn(stage: HTMLElement, p: Point): boolean {
  const column = stage.querySelector('.qr-column')?.getBoundingClientRect();
  return !column || (p.x >= column.left - 2 && p.x <= column.right + 2);
}

/** The PDF page frame nearest to a point, with its place on screen. */
export function pdfFrameAt(stage: HTMLElement, x: number, y: number): { page: number; rect: DOMRect } | null {
  let best: { page: number; rect: DOMRect; d: number } | null = null;
  for (const el of stage.querySelectorAll<HTMLElement>('.pdfp-page[data-page]')) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (!best || d < best.d) best = { page: Number(el.dataset.page), rect: r, d };
  }
  return best && { page: best.page, rect: best.rect };
}

export function pdfFrame(stage: HTMLElement, page: number): DOMRect | null {
  const el = stage.querySelector<HTMLElement>(`.pdfp-page[data-page="${page}"]`);
  const r = el?.getBoundingClientRect();
  return r && r.width ? r : null;
}

export type ReaderKind = 'clean' | 'pdf';
/** The reader that is showing: its stage element, and which kind it is. */
export interface ReaderStage {
  el: HTMLElement;
  kind: ReaderKind;
}

/** The anchor for a place on screen: the nearest word (and the offset from it), or the page under it (margins included). */
export function anchorAtScreen(known: ReaderStage, x: number, y: number): NodeAnchor | null {
  // The reader can have been drawn again since the layer last looked (a PDF's pages replace the text, a page remounts).
  const el = known.el.isConnected ? known.el : known.kind === 'clean' ? findCleanStage() : findPdfStage();
  if (!el) return null;
  const stage: ReaderStage = { el, kind: known.kind };
  if (stage.kind === 'clean') {
    const at = wordAnchorAt(stage.el, x, y);
    const section = at && chapterEl(stage.el, at.chapter);
    const corner = at && section && wordCorner(section, at.offset);
    if (!at || !corner) return null;
    return { kind: 'clean', chapter: at.chapter, offset: at.offset, ...screenToClean({ x, y }, corner, cleanEm(stage.el)) };
  }
  const frame = pdfFrameAt(stage.el, x, y);
  return frame ? { kind: 'pdf', page: frame.page, ...screenToPdf({ x, y }, frame.rect) } : null;
}

/**
 * Scrolls the open reader to a node's home. False when the reader that shows it is not the one open (a node made in a
 * book's text is not on its PDF pages, and the other way round) or the place cannot be found.
 */
export function jumpToAnchor(a: NodeAnchor): boolean {
  if (a.kind === 'clean') return !!findCleanStage() && goToBookLocation(formatCleanLocation({ chapter: a.chapter, start: a.offset, end: a.offset }));
  const stage = findPdfStage();
  const frame = stage?.querySelector<HTMLElement>(`.pdfp-page[data-page="${a.page}"]`);
  if (!stage || !frame) return false;
  const top = frame.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop + (a.y / PDF_UNITS) * frame.offsetWidth;
  stage.scrollTo({ top: Math.max(0, top - stage.clientHeight / 3) });
  return true;
}
