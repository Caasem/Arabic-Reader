import type { Highlight } from './book';
import type { DictionaryEntry } from './dictionary';

/**
 * One Arabic token as encountered in a book. Distinct from a VocabularyItem:
 * the same lemma can surface as many WordInstances (different inflections,
 * different books).
 */
export interface WordInstance {
  surfaceForm: string;
  /** Buckwalter-transliterated, diacritics stripped — used as a lookup key. */
  normalizedForm: string;
  lemma?: string;
  root?: string;

  bookId: string;
  chapterHref?: string;

  sentence?: string;
  paragraph?: string;
  location?: string; // CFI or similar stable locator

  encounterCount: number;
  lookupCount: number;

  firstSeenAt: number;
  lastSeenAt: number;
  firstLookupAt?: number;
  lastLookupAt?: number;

  saved: boolean;
}

export type MasteryLevel = 'new' | 'learning' | 'known' | 'mastered';

export interface VocabularyItem {
  id: string;
  surfaceForm: string;
  lemma?: string;
  root?: string;
  pos?: string;
  /** Short gloss for list views: one entry's senses (see `selectedEntryIndex`),
   * or every entry's senses joined. */
  meaning: string;
  /** Every dictionary entry captured at save time. */
  entries: DictionaryEntry[];
  /** Index into `entries` that `meaning`/`root`/`pos` reflect; undefined
   * means all of them. */
  selectedEntryIndex?: number;

  bookId: string;
  bookTitle: string;
  chapterHref?: string;
  sentence?: string;
  location?: string;

  addedAt: number;
  firstLookupAt?: number;
  lastLookupAt?: number;
  lookupCount: number;
  encounterCount: number;

  mastery: MasteryLevel;
  successfulRecalls: number;
  lastReviewedAt?: number;

  // FSRS scheduling state. Fields mirror ts-fsrs's `Card` one-to-one (see
  // vocabulary/fsrs.ts).

  /** When this item next becomes due for review. */
  fsrsDue: number;
  /** Days until recall probability drops to ~90%. */
  fsrsStability: number;
  /** 1-10, how inherently hard this card is to remember. */
  fsrsDifficulty: number;
  fsrsScheduledDays: number;
  fsrsLearningSteps: number;
  fsrsReps: number;
  fsrsLapses: number;
  /** ts-fsrs State: 0 = New, 1 = Learning, 2 = Review, 3 = Relearning. */
  fsrsState: number;
  fsrsLastReview?: number;

  /** Pushed to Anki via AnkiConnect, so repeat syncs don't duplicate notes. */
  syncedToAnki?: boolean;

  notes?: string;
}

/** Portable backup of what would otherwise be trapped in one browser's
 * IndexedDB. Book files and reading positions aren't included. */
export interface BackupData {
  formatVersion: 1;
  exportedAt: number;
  vocabulary: VocabularyItem[];
  wordInstances: WordInstance[];
  highlights: Highlight[];
}

/** A word's difficulty band from its frequency rank (see vocabRarity/rarity.ts).
 * `unlisted` -- not in the frequency list at all -- is kept distinct from
 * `advanced` (listed, but rare). */
export type VocabTier = 'beginner' | 'intermediate' | 'advanced' | 'unlisted';

export interface WordRarity {
  word: string;
  /** 1-based frequency rank (1 = most common), or null if unlisted. */
  rank: number | null;
  /** 0..1, share of the list at least this common (1 = most common), or null if unlisted. */
  percentile: number | null;
  tier: VocabTier;
  /** Prefix/suffix morphemes attached to this surface form; a heavily
   * affixed form of a common lemma can raise `tier` a level. */
  morphComplexity: number;
}

/** A distinct word in a book's full text, with where it occurs (Vocabulary Levels). */
export interface BookVocabWord {
  word: string;
  /** True total, even when `occurrences` is capped. */
  count: number;
  /** Capped per word, so very common function words don't blow up memory. */
  occurrences: WordOccurrenceLocation[];
  rarity: WordRarity;
}

export interface WordOccurrenceLocation {
  sectionHref: string;
  /** This word's 0-based position among its own occurrences in that section. */
  indexInSection: number;
}
