import type { HighlightColor } from '../types';
import type { ResolvedTheme } from '../state/PreferencesContext';

/**
 * Colors that also have to reach book content. Sections render in iframes,
 * where the host page's CSS custom properties don't apply, so these literal
 * values are injected there. PAGE_COLORS must match --bg/--ink in index.css
 * (tokens.test.ts checks).
 */
export const PAGE_COLORS: Record<ResolvedTheme, { bg: string; ink: string }> = {
  light: { bg: '#faf7f2', ink: '#1c1b19' },
  dark: { bg: '#16151a', ink: '#efe9df' },
  sepia: { bg: '#f1e7d3', ink: '#3a2e1e' },
};

/** Saved vocabulary in the book text: the --danger red, softened on dark pages. */
export const SAVED_WORD_COLOR = { light: '#a8483a', dark: '#c47e70' } as const;

export const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  yellow: '#e7c65b',
  green: '#8bb872',
  blue: '#6fa3c9',
  purple: '#9c85c9',
  red: '#c97a6d',
};
