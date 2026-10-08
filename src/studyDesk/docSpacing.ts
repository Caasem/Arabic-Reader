import { EMBED_CLASS } from './docHtml';

/**
 * Room between items in the desk document. Items are blocks the caret cannot enter, so two of them side
 * by side leave nowhere to type. These helpers find the gap under the pointer, make an empty line in it,
 * and tell whether the caret sits on the first or last line of its block (for the arrow keys).
 */

export const isEmbed = (el: Element | null | undefined): el is HTMLElement => !!el && el.classList.contains(EMBED_CLASS);

const isEmptyLine = (el: Element | undefined) => !!el && el.tagName === 'P' && !el.textContent?.trim();

/** A spot to open a line: before `before` (null: at the end). */
export interface Gap {
  before: Element | null;
  /** Screen height of the line drawn there. */
  y: number;
}

/** How close (px) the pointer must be to a gap's middle. */
const REACH = 9;

/**
 * The gap under a screen height, if any: between two blocks where at least one is an item, above a first
 * item, or below a last one. A gap that already has a line in it is not offered (click the line instead).
 */
export function gapAt(editor: HTMLElement, y: number): Gap | null {
  // Items hidden from the document take no room and are passed over.
  const blocks = Array.from(editor.children).filter((b) => (b as HTMLElement).offsetHeight > 0);
  for (let i = 0; i <= blocks.length; i++) {
    const above = blocks[i - 1];
    const below = blocks[i];
    if (!isEmbed(above) && !isEmbed(below)) continue;
    if (isEmptyLine(above) || isEmptyLine(below)) continue;
    const top = above ? above.getBoundingClientRect().bottom : below!.getBoundingClientRect().top - 2 * REACH;
    const bottom = below ? below.getBoundingClientRect().top : above!.getBoundingClientRect().bottom + 2 * REACH;
    const mid = (top + bottom) / 2;
    if (Math.abs(y - mid) <= Math.max(REACH, (bottom - top) / 2)) return { before: below ?? null, y: mid };
  }
  return null;
}

/** Puts an empty line before `before` (or at the end) and returns it. */
export function openLine(editor: HTMLElement, before: Element | null): HTMLParagraphElement {
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  editor.insertBefore(p, before);
  return p;
}

/** The caret's rectangle, or null when the selection is not a caret inside `block`. */
function caretRect(block: Element): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed || !block.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  // A caret on an empty line has no box of its own: use the line's.
  return r.height ? r : block.getBoundingClientRect();
}

/** True when the caret is on the first line of `block`. */
export function caretOnFirstLine(block: Element): boolean {
  const r = caretRect(block);
  if (!r) return false;
  return r.top - block.getBoundingClientRect().top < r.height * 0.8;
}

/** True when the caret is on the last line of `block`. */
export function caretOnLastLine(block: Element): boolean {
  const r = caretRect(block);
  if (!r) return false;
  return block.getBoundingClientRect().bottom - r.bottom < r.height * 0.8;
}

/** The editor's top-level block holding a node. */
export function blockOf(editor: HTMLElement, node: Node | null): Element | null {
  let n: Node | null = node;
  while (n && n.parentNode !== editor) n = n.parentNode;
  return n instanceof Element ? n : null;
}

/** Puts the caret at the start or end of a block. */
export function caretInto(block: Element, at: 'start' | 'end'): void {
  try {
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(at === 'start');
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  } catch {
    // No caret: harmless.
  }
}
