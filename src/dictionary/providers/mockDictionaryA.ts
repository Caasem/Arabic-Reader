import type { DictionaryEntry, DictionaryProvider } from '../../types';
import { guessLemmaCandidates, normalize } from '../../reader/tokenizer/arabicTokenizer';
import { findLexeme } from './mockData';

/**
 * "Dictionary A" — short, single-gloss entries, styled like a compact
 * pocket dictionary. Stands in for a real lexical data source; swap this
 * class for one backed by an API/local data file without touching the
 * reader or DictionaryManager.
 */
export class MockDictionaryA implements DictionaryProvider {
  id = 'mock-a';
  name = 'Dictionary A';

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const normalized = normalize(word);
    const lexeme = findLexeme(guessLemmaCandidates(normalized));
    if (!lexeme) return [];
    return [
      {
        providerId: this.id,
        providerName: this.name,
        headword: lexeme.lemma,
        senses: [{ gloss: lexeme.glossShort }],
      },
    ];
  }
}
