import type { DictionaryEntry } from '../../../types';
import type { AramorphResult } from './engine';

/** AraMorph's raw readings of a word as entries: one per spelling, its readings as the senses (the adapter to the shared entry shape). */
export function groupAramorphResults(results: AramorphResult[], providerId: string, providerName: string): DictionaryEntry[] {
  const byWord = new Map<string, AramorphResult[]>();
  for (const r of results) {
    if (r.hidden) continue; // made-up verbal nouns only feed analyze()'s roots
    const list = byWord.get(r.word);
    if (list) list.push(r);
    else byWord.set(r.word, [r]);
  }
  return Array.from(byWord.entries()).map(([word, entries]) => ({
    providerId,
    providerName,
    headword: word,
    language: 'en',
    root: entries.find((e) => e.root && e.root !== '---')?.root,
    lemma: entries.find((e) => e.lemma && e.lemma !== '---' && e.lemma !== word)?.lemma,
    verbForm: entries.find((e) => e.verbForm)?.verbForm,
    imperfectVowel: entries.find((e) => e.verbForm === 'I' && e.imperfectVowel)?.imperfectVowel,
    // Readings arrive with the ones that agree with the written vowels first.
    ...(entries.every((e) => e.vowelClash) ? { vowelClash: true } : {}),
    // `pos` here is AraMorph's raw affix analysis ("+at/PVSUFF_SUBJ:3FS"),
    // not a readable part of speech, so it's not shown; the gloss already
    // spells out the grammatical role in English.
    senses: entries.map((e) => ({ gloss: e.def || '(no gloss available)' })),
  }));
}
