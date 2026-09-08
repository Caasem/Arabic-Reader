import type { MorphologicalAnalysis, MorphologyProvider } from '../../types';
import { guessLemmaCandidates, normalize } from '../../reader/tokenizer/arabicTokenizer';
import { findLexeme } from '../providers/mockData';

/**
 * Stand-in for a real morphological analyzer (e.g. the project's existing
 * Buckwalter prefix/stem/suffix tables, or a service like CAMeL Tools).
 * Only resolves surface form -> lemma/root/POS using the same mock lexicon
 * as the two mock dictionaries, so the popup can show a "Root" line even
 * before a real analyzer is wired in.
 */
export class MockMorphologyProvider implements MorphologyProvider {
  id = 'mock-morph';

  async analyze(word: string): Promise<MorphologicalAnalysis[]> {
    const normalized = normalize(word);
    const candidates = guessLemmaCandidates(normalized);
    const lexeme = findLexeme(candidates);
    if (!lexeme) return [];
    return [
      {
        surfaceForm: word,
        lemma: lexeme.lemma,
        root: lexeme.root,
        pos: lexeme.pos,
      },
    ];
  }
}
