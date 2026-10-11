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

const SHADDA = 'ّ';
/** Tanwin read as its short vowel; sukun kept as a vowel of its own. */
const VOWEL_OF: Record<string, string> = { 'ً': 'َ', 'ٌ': 'ُ', 'ٍ': 'ِ', 'َ': 'َ', 'ُ': 'ُ', 'ِ': 'ِ', 'ْ': 'ْ' };

/** A word as letters (keyed as subEntryKey does) with the vowel and shadda each carries. */
function syllables(word: string): { letter: string; vowel?: string; shadda: boolean }[] {
  const out: { letter: string; vowel?: string; shadda: boolean }[] = [];
  for (const ch of word) {
    const last = out[out.length - 1];
    if (ch === SHADDA) {
      if (last) last.shadda = true;
    } else if (VOWEL_OF[ch]) {
      if (last) last.vowel = VOWEL_OF[ch];
    } else {
      const letter = subEntryKey(ch);
      if (letter) out.push({ letter, shadda: false });
    }
  }
  return out;
}

/**
 * True unless the vowels written on `lemma` and on a dictionary's `headword` disagree somewhere both are
 * marked -- telling كِتاب from كُتّاب though both are كتاب. A mark missing on either side matches anything,
 * the last letter's ending (case, tanwin) is ignored, and so is whatever the headword opens with that
 * the lemma lacks (و, the article and the shadda it leaves on a sun letter: الرَّحْمٰنُ for رَحْمٰن).
 */
export function vowelsAgree(lemma: string, headword: string): boolean {
  const a = syllables(lemma);
  let b = syllables(headword);
  const extra = b.length - a.length;
  if (extra < 0) return true;
  if (extra > 0) {
    b = b.slice(extra);
    if (b[0]) b[0] = { ...b[0], shadda: false };
  }
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i].letter !== b[i].letter) return true; // spelled differently: nothing to compare by
    const [x, y] = [a[i], b[i]];
    if (x.vowel && y.vowel && x.vowel !== y.vowel) return false;
    if ((x.vowel || x.shadda) && (y.vowel || y.shadda) && x.shadda !== y.shadda) return false;
  }
  return true;
}
