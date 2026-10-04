import { mix, readableOn } from './color';
import type { LookColors } from './palettes';

/** Dark and sepia keep their own surfaces; only the accents follow the palette. */
const DARK_BG = '#16151a';
const DARK_INK = '#efe9df';
const SEPIA_BG = '#f1e7d3';
const SEPIA_INK = '#3a2e1e';

type Accents = Pick<LookColors, 'accent' | 'secondary' | 'highlight' | 'warning'>;

function accentTokens(c: Accents, bg: string, ink: string, lift: number): Record<string, string> {
  const raise = (hex: string) => (lift > 0 ? mix('#ffffff', hex, lift) : hex);
  const accent = raise(c.accent);
  const secondary = raise(c.secondary);
  const highlight = raise(c.highlight);
  const warning = raise(c.warning);
  const tint = lift > 0 ? 0.24 : 0.18;
  const text = lift > 0 ? 0.75 : 0.5;
  return {
    '--accent': accent,
    '--accent-soft': mix(accent, bg, tint),
    '--danger': warning,
    '--look-accent-ink': mix(accent, ink, text),
    '--look-on-accent': readableOn(accent),
    '--look-secondary': secondary,
    '--look-secondary-soft': mix(secondary, bg, tint),
    '--look-secondary-ink': mix(secondary, ink, text),
    '--look-highlight': highlight,
    '--look-highlight-soft': mix(highlight, bg, tint),
    '--look-highlight-ink': mix(highlight, ink, text),
    '--look-warning': warning,
    '--look-warning-soft': mix(warning, bg, tint),
    '--look-warning-ink': mix(warning, ink, text),
  };
}

function block(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')}}`;
}

/** The CSS variables for the chosen colours, one block per theme. */
export function buildLookCss(c: LookColors): string {
  const light = {
    '--bg': c.bg,
    '--bg-elevated': c.surface,
    '--ink': c.ink,
    '--ink-soft': mix(c.ink, c.bg, 0.68),
    '--ink-faint': mix(c.ink, c.bg, 0.42),
    '--border': mix(c.ink, c.bg, 0.09),
    ...accentTokens(c, c.bg, c.ink, 0),
  };
  return [
    block("html[data-look][data-theme='light']", light),
    block("html[data-look][data-theme='dark']", accentTokens(c, DARK_BG, DARK_INK, 0.28)),
    block("html[data-look][data-theme='sepia']", accentTokens(c, SEPIA_BG, SEPIA_INK, 0)),
  ].join('\n');
}
