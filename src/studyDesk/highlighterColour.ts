/**
 * The Highlighter's colours (Settings → Highlighter): the fill at its strength, and the two outlines drawn from the
 * same hue (resting when Outline is Always, lit when pointed at), so any colour gets outlines that match it.
 */

/** Cream first (the Highlighter's own), then the reader's highlight colours. */
export const HIGHLIGHTER_PRESETS = [
  { id: '#f6ead0', label: 'Cream' },
  { id: '#e7c65b', label: 'Yellow' },
  { id: '#8bb872', label: 'Green' },
  { id: '#6fa3c9', label: 'Blue' },
  { id: '#9c85c9', label: 'Purple' },
  { id: '#c97a6d', label: 'Red' },
] as const;

export const DEFAULT_HIGHLIGHTER_COLOUR = HIGHLIGHTER_PRESETS[0].id;

function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = parseInt(m ? m[1] : DEFAULT_HIGHLIGHTER_COLOUR.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hueSat(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), s, l];
}

/** The fill, as an rgb() with the strength as its alpha. */
export function highlighterFill(hex: string, strength: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${r} ${g} ${b} / ${strength})`;
}

/** Outlines in the colour's hue: `rest` (Outline: Always) and the darker `lit` (pointed at). Greys stay grey. */
export function highlighterOutlines(hex: string): { rest: string; lit: string } {
  const [h, s] = hueSat(hex);
  const grey = s < 0.08;
  const sat = (min: number) => (grey ? 0 : Math.round(Math.max(s, min) * 100));
  return { rest: `hsl(${h} ${sat(0.45)}% 57%)`, lit: `hsl(${h} ${sat(0.5)}% 28%)` };
}

/**
 * Night pages (Display → Pages → Night) show the page inverted: dark paper, light print. There the layer screens
 * instead of multiplying (pdfDesk.css), with the colour's dark twin (its lightness turned over), so the paper under
 * a highlight warms up and the light print stays light. Outlines are lighter than the paper, not darker.
 */
export function highlighterNight(hex: string, strength: number): { fill: string; rest: string; lit: string } {
  const [h, s, l] = hueSat(hex);
  const grey = s < 0.08;
  const sat = (min: number) => (grey ? 0 : Math.round(Math.max(s, min) * 100));
  const dark = Math.round(Math.min(0.32, Math.max(0.14, 1 - l)) * 100);
  return { fill: `hsl(${h} ${sat(0.35)}% ${dark}% / ${strength})`, rest: `hsl(${h} ${sat(0.35)}% 42%)`, lit: `hsl(${h} ${sat(0.5)}% 70%)` };
}
