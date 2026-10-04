import { normalize } from '../../../reader/tokenizer/arabicTokenizer';

/** The weak letters a root's last radical can be spelled with: alef, waw, yaa, alef maqsura. */
const WEAK = ['ا', 'و', 'ي', 'ى'];

/**
 * Spellings of a root whose last radical may be weak. Dictionaries disagree on
 * how to write such a root: AraMorph has اقترى as root قري, Al-Wasit files the
 * same root under the headword "قرا|قرو". Only the last radical is varied, and
 * only when it is weak; the other letters (hamza included) stay exactly as given,
 * so قري can find قرا and قرو but never قرأ.
 */
export function weakLastRadicalVariants(root: string): string[] {
  const letters = Array.from(root);
  const last = letters[letters.length - 1];
  if (letters.length < 3 || !WEAK.includes(last)) return [];
  const stem = letters.slice(0, -1).join('');
  return WEAK.filter((w) => w !== last).map((w) => stem + w);
}

interface AnalysisLike {
  root?: string;
  lemma?: string;
}

/**
 * Every key the tapped word could be filed under in Al-Wasit: the word itself,
 * each root and dictionary form AraMorph found for it, and the weak-letter
 * spellings of those roots.
 */
export function buildLookupKeys(word: string, analyses: AnalysisLike[]): Set<string> {
  const keys = new Set<string>([normalize(word)]);
  for (const a of analyses) {
    if (a.root) {
      const root = normalize(a.root);
      keys.add(root);
      for (const variant of weakLastRadicalVariants(root)) keys.add(variant);
    }
    if (a.lemma) keys.add(normalize(a.lemma));
  }
  return keys;
}
