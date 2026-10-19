export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Turns the boxes a range reports (one per word span, each a little different in height, with gaps between them)
 * into one solid block per line of text. A line's boxes are merged left to right; each block is as tall as the line
 * pitch (`lineHeight`, centred on the text), so the blocks of a highlight that wraps meet with no gap between lines.
 * With no `lineHeight`, a block is the tallest box on its line.
 */
export function lineBlocks(rects: readonly Box[], lineHeight: number | null): Box[] {
  const boxes = rects.filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Box[] = [];
  for (const r of boxes) {
    const last = lines[lines.length - 1];
    const h = Math.min(r.bottom - r.top, last ? last.bottom - last.top : Infinity);
    const overlap = last ? Math.min(r.bottom, last.bottom) - Math.max(r.top, last.top) : 0;
    if (last && overlap > h / 2) {
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.bottom);
    } else lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  if (!lineHeight || lineHeight <= 0) return lines;
  return lines.map((l) => {
    const mid = (l.top + l.bottom) / 2;
    return { left: l.left, right: l.right, top: mid - lineHeight / 2, bottom: mid + lineHeight / 2 };
  });
}
