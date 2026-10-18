import type { HighlightColor } from '../types';

/**
 * Highlights, the flash on a jump and the active search match are drawn with
 * the CSS Custom Highlight API (styled by ::highlight() rules in
 * quietReader.css), so the text's DOM -- its word spans, and the character
 * offsets every saved place depends on -- is never touched. Where the API is
 * missing (iOS before 17.2, Android WebView before 105) the marks still list in
 * the drawer, which says why they aren't drawn (`paintSupported`).
 */
const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/** False where highlights, search matches and jump flashes can't be drawn. */
export const paintSupported = supported;

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];
let flashTimer: number | undefined;

export function paintHighlights(byColor: Map<HighlightColor, Range[]>): void {
  if (!supported) return;
  for (const color of COLORS) {
    const ranges = byColor.get(color);
    if (ranges?.length) CSS.highlights.set(`qr-hl-${color}`, new Highlight(...ranges));
    else CSS.highlights.delete(`qr-hl-${color}`);
  }
}

/** The argument layer's roles (src/arguments), drawn like highlights. A claim that is also grounds adds the grounds colour as an underline. */
export const ARGUMENT_PAINT = ['claim', 'grounds', 'warrant', 'backing', 'qualifier', 'rebuttal', 'objection', 'reply', 'underline-grounds'] as const;

export function paintArguments(byName: Map<string, Range[]>): void {
  if (!supported) return;
  for (const name of ARGUMENT_PAINT) {
    const ranges = byName.get(name);
    if (ranges?.length) CSS.highlights.set(`qr-arg-${name}`, new Highlight(...ranges));
    else CSS.highlights.delete(`qr-arg-${name}`);
  }
}

export function paintSearchMatch(range: Range | null): void {
  if (!supported) return;
  if (range) CSS.highlights.set('qr-search', new Highlight(range));
  else CSS.highlights.delete('qr-search');
}

/** Briefly marks a range, e.g. the word a jump landed on. */
export function flash(range: Range, ms = 1600): void {
  if (!supported) return;
  CSS.highlights.set('qr-flash', new Highlight(range));
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => CSS.highlights.delete('qr-flash'), ms);
}

export function clearPaint(): void {
  if (!supported) return;
  for (const color of COLORS) CSS.highlights.delete(`qr-hl-${color}`);
  for (const name of ARGUMENT_PAINT) CSS.highlights.delete(`qr-arg-${name}`);
  CSS.highlights.delete('qr-search');
  CSS.highlights.delete('qr-flash');
  window.clearTimeout(flashTimer);
}
