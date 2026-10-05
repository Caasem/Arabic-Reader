const MARKS_RE = /[ً-ْٰ]/g;
const TRAILING_MARKS_RE = /[ً-ْٰ]+$/;
const TATWEEL_RE = /ـ/g;

const clean = (s: string) => s.replace(TATWEEL_RE, '').trim();

/**
 * How well a headword's vowel marks agree with the tapped word's, for choosing between
 * homographs (كَتَبَ vs كُتُب): 0 identical; 1 identical apart from the last letter's
 * ending (case or tanwin); 2 no vowels to compare, or they disagree. Lower is better.
 */
export function vowelScore(tapped: string, headword: string): 0 | 1 | 2 {
  const a = clean(tapped);
  const b = clean(headword);
  if (!MARKS_RE.test(a)) return 2;
  MARKS_RE.lastIndex = 0;
  if (a === b) return 0;
  if (a.replace(TRAILING_MARKS_RE, '') === b.replace(TRAILING_MARKS_RE, '')) return 1;
  return 2;
}
