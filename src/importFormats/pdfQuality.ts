/**
 * The text-quality test for PDFs (docs/features/formats-pdf.md section 6). Many Arabic PDFs hold
 * their text in shaped presentation forms, in visual (reversed) order, or with letters that do not
 * map to Unicode at all; converting those would give a book nobody can look words up in. The test
 * reads the first pages and asks the dictionary's morphology whether the words are words.
 */
import { normalizeArabic } from './pdfReflow';

export type TextVerdict =
  /** Text analyses well, or is not Arabic (nothing to test against). */
  | 'ok'
  /** The words analyse far better backwards: the lines were stored in visual order. */
  | 'reversed'
  /** Too few words analyse: unmapped glyphs, missing spaces, or damaged text. */
  | 'broken';

export interface TextQuality {
  verdict: TextVerdict;
  /** Arabic letters in the sample. */
  arabicLetters: number;
  /** Share of those letters stored as presentation forms (U+FB50-FDFF, U+FE70-FEFF), 0..1. */
  presentationShare: number;
  /** Arabic words tested. */
  tokens: number;
  /** Share of the words the dictionary can analyse after the letters are normalised, 0..1. */
  analysedShare: number;
  /** The same share with every word's letters reversed. */
  reversedShare: number;
}

/** Answers which of the words the dictionary can analyse. */
export type WordAnalyser = (words: string[]) => Promise<Set<string>>;

export const PASS_SHARE = 0.7;
const MAX_TOKENS = 1500;
const MIN_TOKENS = 5;

const ARABIC_LETTER = /[ء-يٮ-ۓۺ-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const MARKS = /[ً-ٰٟۖ-ۭـ]/g;

/** Words of the sample as the dictionary sees them: Arabic letters only, no vowel marks, at least two letters. */
export function arabicTokens(text: string): string[] {
  const words = normalizeArabic(text).replace(MARKS, '').split(/[^ء-يٮ-ۓۺ-ۿ]+/);
  return words.filter((w) => w.length >= 2);
}

const reverse = (s: string) => [...s].reverse().join('');

/**
 * Scores `sample`: the text of the first pages exactly as it came out of the PDF, so the
 * presentation-form share is measured before any normalising.
 */
export async function assessText(sample: string, analyse: WordAnalyser): Promise<TextQuality> {
  const arabicLetters = sample.match(ARABIC_LETTER)?.length ?? 0;
  const presentation = sample.match(/[ﭐ-﷿ﹰ-﻿]/g)?.length ?? 0;
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  const tokens = arabicTokens(sample).slice(0, MAX_TOKENS);
  const base: TextQuality = {
    verdict: 'ok',
    arabicLetters,
    presentationShare: arabicLetters ? presentation / arabicLetters : 0,
    tokens: tokens.length,
    analysedShare: 1,
    reversedShare: 0,
  };
  // Not an Arabic text (or too little of it): there is no dictionary to check it against.
  if (!letters || arabicLetters / letters < 0.3 || tokens.length < MIN_TOKENS) return base;

  const unique = [...new Set(tokens)];
  const known = await analyse([...unique, ...unique.map(reverse)]);
  const share = (map: (w: string) => string) => tokens.filter((w) => known.has(map(w))).length / tokens.length;
  const analysedShare = share((w) => w);
  const reversedShare = share(reverse);
  const verdict: TextVerdict = analysedShare >= PASS_SHARE ? 'ok' : reversedShare >= PASS_SHARE && reversedShare > analysedShare + 0.2 ? 'reversed' : 'broken';
  return { ...base, verdict, analysedShare, reversedShare };
}
