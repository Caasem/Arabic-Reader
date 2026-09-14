import type { Book } from 'epubjs';
import type { BookVocabWord, WordOccurrenceLocation } from '../types';
import { tokenize, normalize } from '../reader/tokenizer/arabicTokenizer';
import { forEachSpineSection, sectionBody } from '../reader/epub/epubInternals';
import { getWordRarities } from './rarity';
import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';

/** Common function words can occur thousands of times; stored occurrence
 * locations are capped per word (`count` is always the true total). */
const MAX_STORED_OCCURRENCES_PER_WORD = 60;

/** Per-book, in-memory: building walks every chapter. */
const cache = new Map<string, Promise<BookVocabWord[]>>();

export function invalidateBookVocabIndex(bookId: string): void {
  cache.delete(bookId);
}

/**
 * One entry per distinct surface form in the book -- tokenized exactly as
 * the reader wraps words -- with where it occurs and its frequency-derived
 * rarity. Reads sections directly, so unrendered chapters are included.
 */
export function getBookVocabIndex(bookId: string, book: Book): Promise<BookVocabWord[]> {
  const existing = cache.get(bookId);
  if (existing) return existing;
  const promise = buildIndex(book);
  cache.set(bookId, promise);
  promise.catch(() => cache.delete(bookId)); // don't cache a transient failure
  return promise;
}

async function buildIndex(book: Book): Promise<BookVocabWord[]> {
  // raw surface form (matches .ar-word[data-word]) -> occurrences
  const counts = new Map<string, { count: number; occurrences: WordOccurrenceLocation[] }>();

  await forEachSpineSection(book, (section, doc) => {
    const tokens = tokenize(sectionBody(doc)?.textContent ?? '').filter((t) => t.isArabic);
    // Index among this word's own occurrences in the section -- how
    // goToWordOccurrence() finds it again in the rendered page.
    const seenInSection = new Map<string, number>();
    for (const { text: word } of tokens) {
      const indexInSection = seenInSection.get(word) ?? 0;
      seenInSection.set(word, indexInSection + 1);
      let entry = counts.get(word);
      if (!entry) {
        entry = { count: 0, occurrences: [] };
        counts.set(word, entry);
      }
      entry.count++;
      if (entry.occurrences.length < MAX_STORED_OCCURRENCES_PER_WORD) {
        entry.occurrences.push({ sectionHref: section.href, indexInSection });
      }
    }
  });

  const words = Array.from(counts.keys());
  const normalizedWords = Array.from(new Set(words.map((w) => normalize(w))));

  // Morphology (one batched worker call) refines rarity: affix-heavy forms
  // escalate a tier, and the lemma is a fallback rank key. Best-effort.
  let posByWord: Map<string, string | undefined> | undefined;
  let lemmaByWord: Map<string, string | undefined> | undefined;
  try {
    const analyses = await aramorphProvider.analyzeMany(normalizedWords);
    posByWord = new Map(normalizedWords.map((w) => [w, analyses.get(w)?.[0]?.pos]));
    lemmaByWord = new Map(normalizedWords.map((w) => [w, analyses.get(w)?.[0]?.lemma]));
  } catch {
    // frequency-only tiers
  }

  const rarities = await getWordRarities(normalizedWords, posByWord, lemmaByWord);

  const result: BookVocabWord[] = words.map((word) => {
    const entry = counts.get(word)!;
    const key = normalize(word);
    return {
      word,
      count: entry.count,
      occurrences: entry.occurrences,
      rarity: rarities.get(key) ?? { word: key, rank: null, percentile: null, tier: 'unlisted', morphComplexity: 0 },
    };
  });

  // Rarest first: "here's what's worth learning".
  result.sort((a, b) => (b.rarity.rank ?? Infinity) - (a.rarity.rank ?? Infinity) || a.word.localeCompare(b.word));
  return result;
}
