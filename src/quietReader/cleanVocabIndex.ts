import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';
import { normalize, tokenize } from '../reader/tokenizer/arabicTokenizer';
import { getWordRarities } from '../vocabRarity/rarity';
import type { WordRarity } from '../types';
import type { BookModel } from '../readerCore/bookModel';

const MAX_OCCURRENCES = 60;

/** A distinct word in the clean text, with where it occurs (Vocab levels). */
export interface CleanVocabWord {
  word: string;
  count: number;
  occurrences: { chapter: number; start: number; end: number }[];
  rarity: WordRarity;
}

const cache = new Map<string, Promise<CleanVocabWord[]>>();

/** Every distinct surface form in the book with its frequency-derived rarity, rarest first. Cached per book. */
export function cleanVocabIndex(key: string, model: BookModel): Promise<CleanVocabWord[]> {
  let cached = cache.get(key);
  if (!cached) {
    cached = build(model);
    cache.set(key, cached);
    cached.catch(() => cache.delete(key));
  }
  return cached;
}

async function build(model: BookModel): Promise<CleanVocabWord[]> {
  const counts = new Map<string, { count: number; occurrences: CleanVocabWord['occurrences'] }>();
  model.texts.forEach((text, chapter) => {
    for (const t of tokenize(text)) {
      if (!t.isArabic) continue;
      let entry = counts.get(t.text);
      if (!entry) counts.set(t.text, (entry = { count: 0, occurrences: [] }));
      entry.count++;
      if (entry.occurrences.length < MAX_OCCURRENCES) entry.occurrences.push({ chapter, start: t.start, end: t.end });
    }
  });
  const words = Array.from(counts.keys());
  const normalized = Array.from(new Set(words.map(normalize)));
  let pos: Map<string, string | undefined> | undefined;
  let lemma: Map<string, string | undefined> | undefined;
  try {
    const analyses = await aramorphProvider.analyzeMany(normalized);
    pos = new Map(normalized.map((w) => [w, analyses.get(w)?.[0]?.pos]));
    lemma = new Map(normalized.map((w) => [w, analyses.get(w)?.[0]?.lemma]));
  } catch {
    // frequency-only tiers
  }
  const rarities = await getWordRarities(normalized, pos, lemma);
  return words
    .map((word) => {
      const key = normalize(word);
      const entry = counts.get(word)!;
      return {
        word,
        count: entry.count,
        occurrences: entry.occurrences,
        rarity: rarities.get(key) ?? { word: key, rank: null, percentile: null, tier: 'unlisted' as const, morphComplexity: 0 },
      };
    })
    .sort((a, b) => (b.rarity.rank ?? Infinity) - (a.rarity.rank ?? Infinity) || a.word.localeCompare(b.word));
}
