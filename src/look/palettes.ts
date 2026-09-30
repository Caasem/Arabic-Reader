/** The colour roles a person can choose. Everything else is derived from these. */
export interface LookColors {
  /** Page background. */
  bg: string;
  /** Cards, sidebar and popups. */
  surface: string;
  /** Text. */
  ink: string;
  /** Selection, links and the main accent. */
  accent: string;
  /** Progress bars and known words. */
  secondary: string;
  /** Highlights and new words. */
  highlight: string;
  /** Mistakes and rare words. */
  warning: string;
}

export type LookColorRole = keyof LookColors;

export const LOOK_ROLES: { role: LookColorRole; label: string; hint: string }[] = [
  { role: 'accent', label: 'Accent', hint: 'Selection, links, the current word' },
  { role: 'secondary', label: 'Progress', hint: 'Progress bars and known words' },
  { role: 'highlight', label: 'Highlight', hint: 'New words and streaks' },
  { role: 'warning', label: 'Warning', hint: 'Mistakes and the Again grade' },
  { role: 'bg', label: 'Page background', hint: 'Light theme only' },
  { role: 'surface', label: 'Cards', hint: 'Light theme only' },
  { role: 'ink', label: 'Text', hint: 'Light theme only' },
];

export interface LookPalette {
  id: string;
  name: string;
  blurb: string;
  colors: LookColors;
}

export const LOOK_PALETTES: LookPalette[] = [
  {
    id: 'tan',
    name: 'Warm tan',
    blurb: 'The original cream and tan, extended with teal, gold and brick.',
    colors: { bg: '#faf7f2', surface: '#ffffff', ink: '#1c1b19', accent: '#9c7a4f', secondary: '#2e7d74', highlight: '#c9963a', warning: '#b3543f' },
  },
  {
    id: 'jewel',
    name: 'Jewel tones',
    blurb: 'Lapis, emerald and carnelian on warm paper.',
    colors: { bg: '#f7f4ee', surface: '#ffffff', ink: '#1b1d26', accent: '#1f3f8f', secondary: '#0f766e', highlight: '#c79a2b', warning: '#b4471f' },
  },
  {
    id: 'oasis',
    name: 'Oasis',
    blurb: 'Palm green, sky blue and terracotta.',
    colors: { bg: '#f5f1e8', surface: '#fffdf8', ink: '#20231f', accent: '#2f6f55', secondary: '#3b6ea5', highlight: '#c46f2d', warning: '#b23a48' },
  },
  {
    id: 'spice',
    name: 'Spice market',
    blurb: 'Paprika, olive and saffron.',
    colors: { bg: '#fbf5ec', surface: '#ffffff', ink: '#2a1e17', accent: '#c2410c', secondary: '#4d7c0f', highlight: '#d9a21b', warning: '#6d3b7a' },
  },
  {
    id: 'coastal',
    name: 'Coastal',
    blurb: 'Deep cyan, sage and coral on cool paper.',
    colors: { bg: '#f3f6f5', surface: '#ffffff', ink: '#14232b', accent: '#0e7490', secondary: '#4b8b5f', highlight: '#e07a5f', warning: '#c1121f' },
  },
];

export const DEFAULT_LOOK_PALETTE_ID = 'tan';

export function paletteById(id: string): LookPalette {
  return LOOK_PALETTES.find((p) => p.id === id) ?? LOOK_PALETTES[0];
}

/** A palette with the person's own picks laid over it. */
export function resolveLookColors(paletteId: string, custom: Partial<LookColors> | undefined): LookColors {
  return { ...paletteById(paletteId).colors, ...(custom ?? {}) };
}
