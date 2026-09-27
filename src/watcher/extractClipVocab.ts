import { dictionaryManager } from '../dictionary/DictionaryManager';
import { entryMeaning } from '../vocabulary';
import { normalize, tokenize } from '../reader/tokenizer/arabicTokenizer';
import type { Clip, ClipVocabCard } from './types';

/** Function words too common to ever be "the vocabulary" of a clip -- kept
 * short and hand-picked rather than trying to be a real stopword list. */
const STOPWORDS = new Set([
  'من',
  'في',
  'إلى',
  'على',
  'أن',
  'إن',
  'هو',
  'هي',
  'هم',
  'أي',
  'لا',
  'ما',
  'لأنه',
  'فهو',
  'الذي',
]);

const MAX_CARDS = 8;

/**
 * Distinct content words in a clip's transcript, in first-occurrence order,
 * resolved against the dictionary and capped to a teachable handful. Words
 * the dictionary doesn't recognize (stopwords, clitics the tokenizer didn't
 * fully split, provider gaps) are silently dropped rather than shown
 * without a meaning.
 */
export async function extractClipVocab(clip: Clip): Promise<ClipVocabCard[]> {
  const fullText = clip.transcript.map((s) => s.text).join(' ');
  const seen = new Set<string>();
  const candidates: { surfaceForm: string; normalizedForm: string }[] = [];

  for (const token of tokenize(fullText)) {
    if (!token.isArabic || token.text.length < 2) continue;
    const normalizedForm = normalize(token.text);
    if (STOPWORDS.has(normalizedForm) || seen.has(normalizedForm)) continue;
    seen.add(normalizedForm);
    candidates.push({ surfaceForm: token.text, normalizedForm });
  }

  const cards: ClipVocabCard[] = [];
  for (const candidate of candidates) {
    if (cards.length >= MAX_CARDS) break;
    const result = await dictionaryManager.lookup(candidate.normalizedForm);
    if (result.entries.length === 0) continue;
    cards.push({
      surfaceForm: candidate.surfaceForm,
      normalizedForm: candidate.normalizedForm,
      meaning: entryMeaning(result.entries[0]),
      root: result.entries[0].root,
    });
  }
  return cards;
}
