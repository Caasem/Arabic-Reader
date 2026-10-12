/**
 * Al-Wasīṭ's editorial labels and plural markers, read off a gloss token for display only (the gloss text itself is
 * never changed). Labels close a sense: "... (مج)." Plurals open with "(ج)" and run to the next full stop.
 * Measured on public/alwasit-data/alwasit.tsv: 1,279 (مج), 531 (مو), 326 (مع), 232 (د), 8,507 (ج).
 */

export interface WasitLabel {
  /** The abbreviation without brackets, as printed. */
  abbr: string;
  /** English meaning, for the badge's tooltip. */
  title: string;
}

const LABELS: Record<string, string> = {
  'مج': 'Academy coinage: coined or approved by the Arabic Language Academy',
  'مو': 'Post-classical (muwallad)',
  'مع': 'Arabised (muʿarrab): a foreign word fitted to Arabic',
  'د': 'Foreign (dakhīl): borrowed as it is',
  'محدثة': 'Modern coinage',
};

/** Plural markers: "(ج)" plural, "(جج)" plural of a plural. */
const PLURALS: Record<string, string> = {
  'ج': 'Plural',
  'جج': 'Plural of the plural',
};

/** What a gloss token such as "(مج)." or "(ج)" shows as a badge, or null when it is neither. `token` is diacritic-free. */
export function badgeOf(token: string): { kind: 'label' | 'plural'; text: string; title: string } | null {
  const m = /^\(([^()]+)\)[.،]?$/.exec(token);
  if (!m) return null;
  if (LABELS[m[1]]) return { kind: 'label', text: m[1], title: LABELS[m[1]] };
  if (PLURALS[m[1]]) return { kind: 'plural', text: m[1], title: PLURALS[m[1]] };
  return null;
}
