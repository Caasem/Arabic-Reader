import { foldAlefHamza, normalize } from '../../reader/tokenizer/arabicTokenizer';

const NON_LETTER_RE = /[^ء-ي]/g;

/**
 * The key a dictionary sub-entry and a tapped word are compared by: no diacritics or tatweel
 * (`normalize`), آ/أ/إ/ٱ folded to ا (`foldAlefHamza`), ى read as ي and ة as ه, and nothing but letters
 * (so Lane's old spelling الشَّىْءِ, Al-Ṣiḥāḥ's وفاةٌ and a trailing comma all meet the plain form).
 */
export function subEntryKey(text: string): string {
  return foldAlefHamza(normalize(text)).replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(NON_LETTER_RE, '');
}

/** The article with the conjunctions and prepositions that attach to it, longest first. */
const ARTICLES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال'];
/** One-letter clitics (and, so, with, for, like). */
const CLITICS = ['و', 'ف', 'ب', 'ل', 'ك'];

/** `key` and, when it opens with the article (alone or after و ف ب ك ل), the word without it. */
export function articleVariants(key: string): string[] {
  const out = [key];
  for (const a of ARTICLES) {
    if (key.startsWith(a) && key.length - a.length >= 2) {
      out.push(key.slice(a.length));
      break;
    }
  }
  return out;
}

/** `key` without a leading one-letter clitic, then without the article after it -- guesses, so callers rank them last. */
export function cliticVariants(key: string): string[] {
  const out: string[] = [];
  for (const c of CLITICS) {
    if (key.startsWith(c) && key.length - 1 >= 3) {
      const rest = key.slice(1);
      out.push(...articleVariants(rest));
    }
  }
  return out;
}

/** Root letters that may be missing from a word built on them: weak letters and hamza (قول → قال, رأى → يرى). */
const WEAK_RADICALS = new Set(['ا', 'و', 'ي', 'ء', 'ؤ', 'ئ']);

/**
 * True when `key` holds the strong letters of `root` in order (weak letters and hamza may drop out,
 * a doubled last radical counts once): إدام holds أدم, قيراط holds قرط, ثدي holds ثدي. A root with no strong
 * letter at all is not checked.
 */
export function containsRoot(key: string, root: string): boolean {
  const radicals = Array.from(subEntryKey(root)).filter((c, i, all) => c !== all[i - 1] && !WEAK_RADICALS.has(c));
  let at = 0;
  for (const c of radicals) {
    at = key.indexOf(c, at);
    if (at === -1) return false;
    at++;
  }
  return true;
}
