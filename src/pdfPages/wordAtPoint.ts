import { normalizeArabic } from '../importFormats/pdfReflow';

/** Arabic letters, vowel marks and tatweel, including the shaped presentation forms some PDFs hold. */
const WORD_CHAR = /[ء-يً-ٰٟٱ-ۓۺ-ۿݐ-ݿـﭐ-﷿ﹰ-﻿]/;

/** The Arabic word around `offset` in `text`, as [start, end), or null when the offset is not on one. */
export function wordBounds(text: string, offset: number): [number, number] | null {
  let at = Math.min(Math.max(offset, 0), text.length);
  if (!WORD_CHAR.test(text[at] ?? '')) at -= 1;
  if (at < 0 || !WORD_CHAR.test(text[at] ?? '')) return null;
  let start = at;
  let end = at + 1;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return [start, end];
}

/** The word as the dictionary wants it: plain letters (presentation forms folded), no tatweel. */
export const cleanWord = (raw: string): string => normalizeArabic(raw);

interface CaretPosition {
  offsetNode: Node;
  offset: number;
}

/** The text node and offset under a point, across browsers. */
function caretAt(x: number, y: number): CaretPosition | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) return doc.caretPositionFromPoint(x, y);
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { offsetNode: range.startContainer, offset: range.startOffset } : null;
}

export interface PointedWord {
  word: string;
  /** The text run the word is in, for a sentence of context. */
  run: string;
  rect: DOMRect;
  element: HTMLElement;
}

/** The Arabic word drawn under a point inside `layer` (the page's transparent text layer), if any. */
export function wordAtPoint(layer: HTMLElement, x: number, y: number): PointedWord | null {
  const caret = caretAt(x, y);
  const node = caret?.offsetNode;
  if (!caret || !node || node.nodeType !== Node.TEXT_NODE || !layer.contains(node)) return null;
  const text = node.textContent ?? '';
  const bounds = wordBounds(text, caret.offset);
  if (!bounds) return null;
  const range = document.createRange();
  range.setStart(node, bounds[0]);
  range.setEnd(node, bounds[1]);
  const rect = range.getBoundingClientRect();
  // The caret snaps to the nearest letter, so make sure the point is on the word itself.
  if (x < rect.left - 6 || x > rect.right + 6 || y < rect.top - 6 || y > rect.bottom + 6) return null;
  const word = cleanWord(text.slice(bounds[0], bounds[1]));
  return word ? { word, run: text, rect, element: node.parentElement ?? layer } : null;
}
