/**
 * Arabic tokenisation, independent of any UI: text in, token spans with
 * offsets out (the wordInteraction layer wraps them in <span>s).
 *
 * Words are runs of Arabic letters, clitics included (و، ف، ب، ال، ها…) --
 * matching the AraMorph dictionary, which resolves clitics itself via its
 * prefix/suffix tables. `normalize()` produces the lookup key.
 */

export interface Token {
  text: string;
  start: number;
  end: number;
  isArabic: boolean;
}

/** Arabic, Arabic Supplement, and both presentation-form blocks. */
const ARABIC_RUN_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g;

/** Characters inside those blocks that are not word characters: Arabic
 * punctuation and number signs (، ؛ ؟ ٪ ۔ ۝ ۞ ۩ …) and both sets of
 * Arabic-Indic digits. They must never be glued onto a lookup key. */
const NON_WORD_RE = /[؀-؅،؍؛؞؟٠-٭۔۝۞۩۰-۹]/;

const DIACRITICS_RE = /[ً-ٰۖ-ۭ]/g; // harakat, tanwin, sukun, shadda, Quranic marks
const TATWEEL_RE = /ـ/g;

/** Splits text into Arabic-word tokens and everything else (Latin text,
 * digits, punctuation, whitespace), with exact offsets. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  ARABIC_RUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ARABIC_RUN_RE.exec(text))) {
    if (m.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, m.index), start: lastIndex, end: m.index, isArabic: false });
    }
    const run = m[0];
    for (let i = 0; i < run.length; ) {
      const isWord = !NON_WORD_RE.test(run[i]);
      let j = i + 1;
      while (j < run.length && !NON_WORD_RE.test(run[j]) === isWord) j++;
      tokens.push({ text: run.slice(i, j), start: m.index + i, end: m.index + j, isArabic: isWord });
      i = j;
    }
    lastIndex = m.index + run.length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), start: lastIndex, end: text.length, isArabic: false });
  }
  return tokens;
}

/** Strips diacritics and tatweel so surface variants share a lookup key. */
export function normalize(word: string): string {
  return word.replace(DIACRITICS_RE, '').replace(TATWEEL_RE, '');
}

// Non-global copies for single-character tests: `.test()` on a global regex
// advances lastIndex and alternates true/false across calls.
const IS_DIACRITIC_RE = new RegExp(DIACRITICS_RE.source);
const IS_TATWEEL_RE = new RegExp(TATWEEL_RE.source);
const ALEF_VARIANT_RE = /[آأإٱ]/; // آ أ إ ٱ
const ALEF_VARIANTS_GLOBAL_RE = new RegExp(ALEF_VARIANT_RE.source, 'g');

/**
 * Search-only normalization: drops diacritics/tatweel and folds آ/أ/إ/ٱ to ا.
 * Kept separate from `normalize()` (dictionary and vocabulary keys), whose
 * behavior the AraMorph data already accounts for. Returns an index map
 * (`toOriginal[i]` = index in `text` of `normalized[i]`) so a match in the
 * normalized text can be mapped back to a DOM Range in the original.
 */
export function normalizeForSearch(text: string): { normalized: string; toOriginal: number[] } {
  let normalized = '';
  const toOriginal: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (IS_DIACRITIC_RE.test(ch) || IS_TATWEEL_RE.test(ch)) continue;
    normalized += ALEF_VARIANT_RE.test(ch) ? 'ا' : ch;
    toOriginal.push(i);
  }
  return { normalized, toOriginal };
}

/** Folds آ/أ/إ/ٱ to ا (e.g. to match Al-Wasīṭ's headword spellings). */
export function foldAlefHamza(text: string): string {
  return text.replace(ALEF_VARIANTS_GLOBAL_RE, 'ا');
}

/**
 * Cheap clitic stripping used only by the development demo dictionaries to
 * guess a lemma. Real morphology comes from AraMorph.
 */
const COMMON_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'وب', 'وف', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
const COMMON_SUFFIXES = ['هما', 'كما', 'هم', 'هن', 'كم', 'كن', 'نا', 'ها', 'ه', 'ي', 'ك', 'ون', 'ين', 'ات', 'ة'];

export function guessLemmaCandidates(normalizedWord: string): string[] {
  const candidates = new Set<string>([normalizedWord]);
  for (const p of COMMON_PREFIXES) {
    if (normalizedWord.startsWith(p) && normalizedWord.length - p.length >= 2) candidates.add(normalizedWord.slice(p.length));
  }
  for (const s of COMMON_SUFFIXES) {
    if (normalizedWord.endsWith(s) && normalizedWord.length - s.length >= 2) candidates.add(normalizedWord.slice(0, -s.length));
  }
  return Array.from(candidates);
}
