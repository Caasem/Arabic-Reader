import { dictionaryManager } from '../dictionary/DictionaryManager';
import type { BookMeta, DictionaryEntry, DictionaryLookupResult, VocabularyItem, WordInstance } from '../types';
import { vocabularyService } from './vocabularyService';

export interface WordLookup {
  word: string;
  result: DictionaryLookupResult;
  instance: WordInstance;
  saved: boolean;
}

/** What every word tap does -- dictionary lookup, saved check, and lookup
 * tracking -- whether it ends in a popup, a bubble, a quick-save, or the
 * Speed Reader. */
export async function lookupWord(
  bookId: string,
  word: string,
  context: { chapterHref?: string; sentence?: string }
): Promise<WordLookup> {
  const [result, saved] = await Promise.all([dictionaryManager.lookup(word), vocabularyService.isSaved(bookId, word)]);
  const morphology = result.morphology?.[0];
  const instance = await vocabularyService.recordLookup(bookId, word, {
    chapterHref: context.chapterHref,
    sentence: context.sentence,
    lemma: morphology?.lemma,
    root: morphology?.root ?? result.entries[0]?.root,
  });
  return { word, result, instance, saved };
}

/**
 * Saves a lookup as one vocabulary card: every entry by default, or just
 * `entries` (e.g. one entry, or a trimmed selection of one). `describedBy`
 * is the dictionary entry whose root/lemma/part of speech describe the card;
 * without it, the lookup's morphology does.
 */
export function saveLookup(
  book: BookMeta,
  lookup: { word: string; result: DictionaryLookupResult; instance: WordInstance | null },
  options: { entries?: DictionaryEntry[]; describedBy?: DictionaryEntry; chapterHref?: string } = {}
): Promise<VocabularyItem> {
  const entries = options.entries ?? lookup.result.entries;
  const chosen = options.describedBy;
  const morphology = lookup.result.morphology?.[0];
  return vocabularyService.saveToVocabulary({
    surfaceForm: lookup.word,
    entries,
    lemma: chosen ? chosen.lemma : morphology?.lemma,
    root: chosen ? chosen.root : (morphology?.root ?? entries[0]?.root),
    pos: chosen ? chosen.senses[0]?.pos : morphology?.pos,
    book,
    chapterHref: options.chapterHref,
    wordInstance: lookup.instance ?? undefined,
  });
}
