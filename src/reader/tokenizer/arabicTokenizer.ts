/**
 * Arabic tokenisation service.
 *
 * Kept deliberately separate from any visual component: the reader hands it
 * plain text (or a DOM text node's value) and gets back token spans with
 * offsets, which the wordInteraction layer then wraps in <span>s. This means
 * a future mobile client (or a server-side pre-processing pass) can reuse
 * the exact same tokenisation logic.
 *
 * The current implementation splits on Arabic-letter runs, which correctly
 * isolates words including attached clitics (و، ف، ب، ك، ل، ال، ها، هم, …) as
 * single surface forms — matching how the Buckwalter/AraMorph-style
 * dictionaries this project already uses expect input (they resolve
 * clitics via prefix/suffix tables at lookup time, not at tokenisation
 * time). `normalize()` below produces the lookup key for that layer.
 */

export interface Token {
  text: string;
  start: number;
  end: number;
  isArabic: boolean;
}

// Arabic letters + presentation forms + tatweel, matches the project's
// existing extension (see arabicRegex in main.js) plus a slightly wider
// Unicode range so precomposed/extended Arabic blocks are covered too.
// NOTE: this range also contains a handful of Arabic-script *punctuation*
// marks (they share the same Unicode block as the letters), which are not
// word characters and must not end up glued onto a lookup key -- see
// ARABIC_PUNCTUATION_RE below.
const ARABIC_WORD_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g;

const DIACRITICS_RE = /[ً-ٰٟۖ-ۭ]/g; // harakat, tanwin, sukun, etc.
const TATWEEL_RE = /ـ/g;

// Arabic-script punctuation/format/number-sign characters that live inside
// the same Unicode ranges ARABIC_WORD_RE matches, so a naive "run of Arabic
// block characters" match glues them onto adjacent words (e.g. the Arabic
// comma ، or question mark ؟ ending up as part of the lookup key
// instead of being treated as separate punctuation, the way an ASCII comma
// already is). Trimmed off the edges of each matched run below and
// re-emitted as their own non-Arabic (punctuation) token(s) instead.
const ARABIC_PUNCTUATION_RE = /[؀؁؂؃؄؅،؍؛؞؟٪٫٬٭۔۝۞۩]/;

/**
 * Split a plain-text string into tokens, distinguishing Arabic-letter runs
 * from everything else (Latin text, digits, punctuation, whitespace).
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  ARABIC_WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ARABIC_WORD_RE.exec(text))) {
    if (m.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, m.index), start: lastIndex, end: m.index, isArabic: false });
    }

    // Split this run further wherever an Arabic-script punctuation mark
    // occurs (they share ARABIC_WORD_RE's Unicode ranges, so they show up
    // inside the "word" match) so none of it ends up glued onto a lookup
    // key -- each punctuation character becomes its own non-Arabic token,
    // same as any other punctuation.
    const runStart = m.index;
    const run = m[0];
    let segStart = 0;
    for (let i = 0; i <= run.length; i++) {
      const isPunct = i < run.length && ARABIC_PUNCTUATION_RE.test(run[i]);
      if (isPunct || i === run.length) {
        if (i > segStart) {
          tokens.push({
            text: run.slice(segStart, i),
            start: runStart + segStart,
            end: runStart + i,
            isArabic: true,
          });
        }
        if (isPunct) {
          tokens.push({ text: run[i], start: runStart + i, end: runStart + i + 1, isArabic: false });
        }
        segStart = i + 1;
      }
    }

    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), start: lastIndex, end: text.length, isArabic: false });
  }
  return tokens;
}

/** Strip diacritics/tatweel so surface variants of the same word share a lookup key. */
export function normalize(word: string): string {
  return word.replace(DIACRITICS_RE, '').replace(TATWEEL_RE, '');
}

/**
 * Best-effort clitic stripping used only to *suggest* a lemma candidate for
 * mock dictionary providers when no morphology service is wired up yet.
 * Real morphological resolution (prefix+stem+suffix grammar, as in the
 * project's existing AraMorph-style tables) belongs in a MorphologyProvider,
 * not here — this is a cheap heuristic fallback only.
 */
const COMMON_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'وب', 'وف', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
const COMMON_SUFFIXES = ['هما', 'كما', 'هم', 'هن', 'كم', 'كن', 'نا', 'ها', 'ه', 'ي', 'ك', 'ون', 'ين', 'ات', 'ة'];

export function guessLemmaCandidates(normalizedWord: string): string[] {
  const candidates = new Set<string>([normalizedWord]);
  for (const p of COMMON_PREFIXES) {
    if (normalizedWord.startsWith(p) && normalizedWord.length - p.length >= 2) {
      candidates.add(normalizedWord.slice(p.length));
    }
  }
  for (const s of COMMON_SUFFIXES) {
    if (normalizedWord.endsWith(s) && normalizedWord.length - s.length >= 2) {
      candidates.add(normalizedWord.slice(0, -s.length));
    }
  }
  return Array.from(candidates);
}
