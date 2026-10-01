/**
 * Character offsets inside a rendered chapter section, so a place in the text
 * can be stored as a number and found again after the page is re-rendered.
 * Offsets count the section's textContent, which equals chapterText().
 */

/** The offset of a DOM position (as in a Range boundary) within `root`. */
export function offsetWithin(root: Node, node: Node, nodeOffset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, nodeOffset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

/** A Range spanning [start, end) of `root`'s text, or null when out of bounds. */
export function rangeAt(root: Node, start: number, end: number): Range | null {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let seen = 0;
  let started = false;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (!started && start <= seen + length) {
      // A start exactly at a node's end belongs to the next node, unless it is also the end.
      if (start === seen + length && end > start) {
        seen += length;
        continue;
      }
      range.setStart(node, start - seen);
      started = true;
    }
    if (started && end <= seen + length) {
      range.setEnd(node, end - seen);
      return range;
    }
    seen += length;
  }
  return null;
}

/** The text position under a viewport point, in whichever form the browser offers. */
export function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}
