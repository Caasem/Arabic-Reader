import type { KnownWords, WordRanks } from './repair';

const MARKS = /[ً-ٰٟـ]/g;

/**
 * Which of the words are real words, by AraMorph (it reads words as printed, prefixes and endings
 * included, so it judges inflected forms). Loaded on first use; a dictionary that cannot load
 * says nothing is known, so nothing is flagged and no repair is attempted.
 */
export const knownWords: KnownWords = async (words) => {
  try {
    const { aramorphProvider } = await import('../../dictionary/providers/aramorph/AramorphDictionaryProvider');
    const bare = words.map((w) => w.replace(MARKS, ''));
    const analyses = await aramorphProvider.analyzeMany([...new Set(bare)]);
    return new Set(words.filter((_, i) => (analyses.get(bare[i])?.length ?? 0) > 0));
  } catch {
    return new Set(words);
  }
};

/** Frequency ranks from the word list, when the reader has Vocabulary Levels data on. */
export const wordRanks: WordRanks = async (words) => {
  const out = new Map<string, number>();
  try {
    const { getWordRarities, isRarityDataReady } = await import('../../vocabRarity/rarity');
    if (!(await isRarityDataReady())) return out;
    for (const [word, rarity] of await getWordRarities(words)) if (rarity.rank !== null) out.set(word, rarity.rank);
  } catch {
    // ranks are a nicety
  }
  return out;
};
