/**
 * Hans Wehr packs every derived form of a verb into one paragraph; extraction (scripts/extract-lexicon-data.py)
 * starts a new line at each bold form number, so a form's line opens with its Roman numeral:
 * "VI to envy each other", "V and XII احدودب iḥaudaba to be …".
 */
const NUMBERS: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15 };
const NUMERAL = '(?:XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)';
const FORM_LINE_RE = new RegExp(`^(${NUMERAL}(?: and ${NUMERAL})*)(?=\\s)`);

export interface HansWehrFormLine {
  /** The label as written: "VI", "V and XII". */
  label: string;
  /** The forms it names, as numbers (Lane's / AraMorph's): [6], [5, 12]. */
  forms: number[];
}

/** The derived form(s) a Hans Wehr line is about, or null for any other line (including the opening verb paragraph). */
export function hansWehrFormLine(gloss: string): HansWehrFormLine | null {
  const m = FORM_LINE_RE.exec(gloss.trimStart());
  if (!m) return null;
  return { label: m[1], forms: m[1].split(' and ').map((n) => NUMBERS[n]) };
}
