import type { Book } from 'epubjs';
import type { BookVocabWord, WordOccurrenceLocation } from '../types';
import { tokenize, normalize } from '../reader/tokenizer/arabicTokenizer';
import { getWordRarities } from './rarity';
import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';

/** Very common function words (و, في, من, ...) can occur thousands of times
 * in a single book — storing every single location for those would bloat
 * memory for no real benefit (nobody needs to jump through 4,000 instances
 * of "و" one at a time). Occurrence *locations* are capped per word; the
 * reported `count` is always the true total regardless of the cap. */
const MAX_STORED_OCCURRENCES_PER_WORD = 60;

/** Per-book cache — rebuilding requires walking every chapter, which is
 * cheap for a normal-sized book but still real async work, so a book
 * opened more than once in a session (or the Vocabulary Levels panel
 * toggled closed/open) shouldn't repeat it. Keyed by bookId; cleared
 * implicitly by page reload since it's memory-only. */
const cache = new Map<string, Promise<BookVocabWord[]>>();

export function invalidateBookVocabIndex(bookId: string): void {
  cache.delete(bookId);
}

/**
 * Walks every section in the book's spine, tokenizes its text the exact
 * same way the reader does for click-to-lookup (`wrapArabicWords` /
 * `tokenize`), and builds one entry per distinct surface form with every
 * place it occurs (capped, see above) plus its frequency-derived rarity
 * tier.
 *
 * This reads each section via `section.load()` (the same mechanism
 * `resolveFootnote.ts` uses for cross-file notes) rather than requiring
 * every chapter to actually be rendered in the visible iframe — so it
 * works even for chapters the reader hasn't scrolled to yet.
 */
export function getBookVocabIndex(bookId: string, book: Book): Promise<BookVocabWord[]> {
  const existing = cache.get(bookId);
  if (existing) return existing;
  const promise = buildIndex(book);
  cache.set(bookId, promise);
  // Don't leave a rejected promise cached — a transient failure (e.g. a
  // malformed section) shouldn't permanently poison this book's index.
  promise.catch(() => cache.delete(bookId));
  return promise;
}

async function buildIndex(book: Book): Promise<BookVocabWord[]> {
  // word (raw surface form, matches .ar-word[data-word]) -> occurrence data
  const counts = new Map<string, { count: number; occurrences: WordOccurrenceLocation[] }>();

  const spineItems = (book.spine as unknown as { spineItems: Array<{ href: string; load: (loader: any) => Promise<unknown> }> })
    .spineItems;
  for (const section of spineItems) {
    let loaded: Element | Document | null = null;
    try {
      // epub.js's Section.load() resolves with `xml.documentElement` (an
      // Element — the <html> root), not a full Document, despite its own
      // JSDoc claiming otherwise — so `.body` only exists on it if it's
      // actually a Document (harmless to check for), and `.textContent` on
      // the root element is the reliable way to get every section's text
      // regardless of which shape comes back.
      loaded = (await section.load(book.load.bind(book))) as unknown as Element | Document;
    } catch {
      continue; // one unreadable section shouldn't abort the whole index
    }
    if (!loaded) continue;

    const bodyEl = (loaded as Document).body ?? (loaded as Element).querySelector?.('body') ?? loaded;
    const text = bodyEl?.textContent || '';
    const tokens = tokenize(text).filter((t) => t.isArabic);

    // Position within *this section's own* Arabic-word sequence — matches
    // how goToWordOccurrence() later counts matches within a rendered
    // section (both walk .ar-word-equivalent tokens in document order).
    const perWordIndexInSection = new Map<string, number>();
    for (const t of tokens) {
      const word = t.text;
      const idx = perWordIndexInSection.get(word) ?? 0;
      perWordIndexInSection.set(word, idx + 1);

      let entry = counts.get(word);
      if (!entry) {
        entry = { count: 0, occurrences: [] };
        counts.set(word, entry);
      }
      entry.count++;
      if (entry.occurrences.length < MAX_STORED_OCCURRENCES_PER_WORD) {
        entry.occurrences.push({ sectionHref: section.href, indexInSection: idx });
      }
    }

    try {
      (section as any).unload?.();
    } catch {
      // best-effort memory cleanup only
    }
  }

  const words = Array.from(counts.keys());
  const normalizedWords = Array.from(new Set(words.map((w) => normalize(w))));

  // Morphology per distinct word, for the rarity system's complexity
  // escalation (see rarity.ts) -- one batched worker round-trip rather than
  // one per word, since a book easily has several thousand distinct words.
  // Best-effort: an analysis failure just means that word's tier falls back
  // to frequency-only, not a broken index.
  let posByWord: Map<string, string | undefined> | undefined;
  try {
    const analyses = await aramorphProvider.analyzeMany(normalizedWords);
    posByWord = new Map(normalizedWords.map((w) => [w, analyses.get(w)?.[0]?.pos]));
  } catch {
    posByWord = undefined;
  }

  const rarities = await getWordRarities(normalizedWords, posByWord);

  const result: BookVocabWord[] = words.map((word) => {
    const entry = counts.get(word)!;
    return {
      word,
      count: entry.count,
      occurrences: entry.occurrences,
      rarity: rarities.get(normalize(word)) ?? { word: normalize(word), rank: null, percentile: null, tier: 'unlisted', morphComplexity: 0 },
    };
  });

  // Rarest-first reads naturally as "here's what's worth learning" — the
  // UI's own tier filter narrows further, but a sensible default order
  // matters for whichever tier someone opens first.
  result.sort((a, b) => (b.rarity.rank ?? Infinity) - (a.rarity.rank ?? Infinity) || a.word.localeCompare(b.word));
  return result;
}
