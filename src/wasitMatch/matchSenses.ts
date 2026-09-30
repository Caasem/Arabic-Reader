import type { DictionaryEntry, MorphologicalAnalysis } from '../types';
import { foldAlefHamza, normalize } from '../reader/tokenizer/arabicTokenizer';

/** Al-Wasit opens each derived-form sense with its own citation form in
 * parentheses -- "(كَتَبَ) الكتابَ ...", "(أَكْتَبَهُ): علَّمه ...". Senses that
 * continue the previous one start with "و-" instead and have no such form. */
const LEAD_FORM_RE = /^\s*\(([^()]+)\)/;

function key(text: string): string {
  return foldAlefHamza(normalize(text)).trim();
}

/** The citation form a sense opens with, or null for a continuation sense. */
export function leadForm(gloss: string): string | null {
  return LEAD_FORM_RE.exec(gloss)?.[1] ?? null;
}

/**
 * Indexes of the entry's senses whose citation form is what the reader
 * looked up: the tapped surface form itself, or a lemma AraMorph resolved it
 * to (tapping كَاتَبْتُهُ marks the "(كَاتَبَ)" sense). Diacritics and alef/hamza
 * variants are ignored, same as the dictionary's own matching.
 */
export function findMatchedSenses(entry: DictionaryEntry, word: string, morphology: MorphologicalAnalysis[] = []): Set<number> {
  const wanted = new Set<string>([key(word)]);
  for (const m of morphology) if (m.lemma) wanted.add(key(m.lemma));
  wanted.delete('');

  const matched = new Set<number>();
  entry.senses.forEach((sense, i) => {
    const lead = leadForm(sense.gloss);
    if (lead && wanted.has(key(lead))) matched.add(i);
  });
  return matched;
}
