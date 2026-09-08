import type { VocabTier, WordRarity } from '../types';
import { isEnabled, setEnabled, setDisabled } from './frequencyStore';
import { getFrequencyIndex, type IngestProgress } from './frequencyIndex';

/**
 * Rank cutoffs for the three learner-facing tiers, chosen to mirror how a
 * graded-reader vocabulary list is usually organized rather than exposing
 * raw percentiles: a small "beginner" core of the most frequent words, a
 * wider "intermediate" band, and everything past that treated as
 * "advanced" (including words absent from the list entirely, see
 * `VocabTier`'s `unlisted`, which is tracked separately but grouped
 * visually with "advanced" — a word that's too rare to be in an
 * 11.4M-word corpus reads as at least as hard as the tail of "advanced").
 *
 * These are reasonable starting defaults, not a tuned scale — vocabulary
 * research on Arabic (and most languages) suggests a few thousand words
 * cover the bulk of everyday text, so beginner/intermediate stay narrow on
 * purpose. Adjust here if real books show the bands feel off.
 */
export const TIER_CUTOFFS = {
  beginner: 2000,
  intermediate: 10000,
};

export function tierForRank(rank: number | null): VocabTier {
  if (rank === null) return 'unlisted';
  if (rank <= TIER_CUTOFFS.beginner) return 'beginner';
  if (rank <= TIER_CUTOFFS.intermediate) return 'intermediate';
  return 'advanced';
}

export const TIER_LABELS: Record<VocabTier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  unlisted: 'Advanced', // shown grouped with advanced in tier-picker UI; kept distinct in data (see VocabTier doc)
};

function toRarity(word: string, rank: number | null, total: number): WordRarity {
  return {
    word,
    rank,
    percentile: rank !== null && total > 0 ? 1 - (rank - 1) / total : null,
    tier: tierForRank(rank),
  };
}

export async function getWordRarity(word: string): Promise<WordRarity> {
  const { ranks, total } = await getFrequencyIndex();
  return toRarity(word, ranks.get(word) ?? null, total);
}

/** Batch version for building a whole book's vocabulary index — cheap here
 * since the underlying index is just one shared in-memory Map either way,
 * but keeps callers symmetrical with the earlier per-row-lookup API. */
export async function getWordRarities(words: string[]): Promise<Map<string, WordRarity>> {
  const { ranks, total } = await getFrequencyIndex();
  const out = new Map<string, WordRarity>();
  for (const word of words) {
    out.set(word, toRarity(word, ranks.get(word) ?? null, total));
  }
  return out;
}

/** Whether the user has opted in — persisted, so Settings/Vocab Levels
 * don't need to ask again next session (see `frequencyStore.ts`). This is
 * about *intent*, not whether the ~14s in-memory build has actually run
 * yet this session — callers that need data now should call
 * `enableRarityData`/`getWordRarity(ies)`, which build it on demand. */
export async function isRarityDataReady(): Promise<boolean> {
  return isEnabled();
}

/** Records the opt-in choice and (re)builds the in-memory index for this
 * session, reporting progress as it streams through the bundled dataset. */
export async function enableRarityData(onProgress?: (p: IngestProgress) => void): Promise<void> {
  await getFrequencyIndex(onProgress);
  await setEnabled();
}

export async function disableRarityData(): Promise<void> {
  await setDisabled();
}
