/** Arabic fonts commonly found on Windows, macOS/iOS and Linux. Only the ones
 * actually installed are offered; none of them ship with the app. */
const CANDIDATES = [
  'Amiri',
  'Scheherazade New',
  'Lotus Linotype',
  'Traditional Arabic',
  'Arabic Typesetting',
  'Sakkal Majalla',
  'Simplified Arabic',
  'Geeza Pro',
  'Baghdad',
  'Damascus',
  'Al Nile',
  'Noto Sans Arabic',
];

const SAMPLE = 'وخير جليس في الزمان كتاب Aa';
const BASES = ['monospace', 'serif', 'sans-serif'];

/**
 * A font is installed if naming it changes how the sample measures against
 * at least one generic family (an unknown name just falls through to it).
 */
export function detectDeviceFonts(): string[] {
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return [];
  const width = (font: string) => {
    ctx.font = `32px ${font}`;
    return ctx.measureText(SAMPLE).width;
  };
  const baseWidths = BASES.map(width);
  return CANDIDATES.filter((name) => BASES.some((base, i) => width(`'${name}', ${base}`) !== baseWidths[i]));
}
