export interface Span {
  start: number;
  end: number;
}

const isSpace = (c: string) => /\s/.test(c);

/**
 * Snaps a selection to whole words and trims spaces. Offsets are into the text in logical order, so a selection
 * made right to left (first offset after the second) gives the same result as left to right. Under 2 characters: null.
 */
export function snapSelection(text: string, a: number, b: number): Span | null {
  let s = Math.max(0, Math.min(a, b));
  let e = Math.min(text.length, Math.max(a, b));
  // trim first, so a selection that starts on a space does not grow into the word before it
  while (s < e && isSpace(text[s])) s++;
  while (e > s && isSpace(text[e - 1])) e--;
  if (s === e) return null;
  while (s > 0 && !isSpace(text[s - 1])) s--;
  while (e < text.length && !isSpace(text[e])) e++;
  return e - s < 2 ? null : { start: s, end: e };
}

export const OVERLAP_TOAST = 'That overlaps another highlight. Select clear words.';

export const overlaps = (spans: readonly Span[], sel: Span): boolean =>
  spans.some((x) => sel.start < x.end && sel.end > x.start);
