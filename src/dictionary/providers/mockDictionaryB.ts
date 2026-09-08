import type { DictionaryEntry, DictionaryProvider } from '../../types';
import { guessLemmaCandidates, normalize } from '../../reader/tokenizer/arabicTokenizer';
import { findLexeme } from './mockData';

/**
 * "Dictionary B" — fuller entries: vocalized headword, root, part of
 * speech/gender, and a longer gloss with multiple senses. Demonstrates that
 * the dictionary layer supports more than one provider returning entries
 * of different shape for the same word (see DictionaryManager).
 */
export class MockDictionaryB implements DictionaryProvider {
  id = 'mock-b';
  name = 'Dictionary B';

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const normalized = normalize(word);
    const lexeme = findLexeme(guessLemmaCandidates(normalized));
    if (!lexeme) return [];
    return [
      {
        providerId: this.id,
        providerName: this.name,
        headword: lexeme.vocalized,
        root: lexeme.root,
        senses: lexeme.glossLong.split(';').map((g) => ({
          gloss: g.trim(),
          pos: lexeme.pos,
          gender: lexeme.gender,
        })),
      },
    ];
  }
}
