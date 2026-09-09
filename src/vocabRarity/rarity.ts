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
 * visually with "advanced").
 *
 * Scaled to the KSUCCA-derived list's size (see frequencyIndex.ts) — a
 * corpus-wide lemma frequency ranking over 50M+ words of Classical Arabic,
 * replacing the earlier hand-curated "The List" (~5,300 entries). Adjust
 * here if real books show the bands feel off.
 */
export const TIER_CUTOFFS = {
  beginner: 2000,
  intermediate: 8000,
};

/** A surface form loaded with attached morphemes (prefixes, suffixes,
 * pronoun clitics) reads as harder than its bare rank alone suggests, even
 * when the underlying lemma is common -- فسيكتبونهما is a real reading
 * obstacle even though its lemma كتب is about as frequent as Arabic
 * vocabulary gets. AraMorph's own `pos` analysis already records exactly
 * which affix morphemes combined to produce a given surface form (e.g.
 * "wa/CONJ+sa/FUT+ya/IV3MP+uwna/IVSUFF_SUBJ:MP+hA/IVSUFF_DO:3FS" -- five
 * attached morphemes), so morphological complexity is measured by counting
 * those segments rather than needing any separate corpus-derived signal.
 */
const MORPH_COMPLEXITY_ESCALATE_AT = 3;

function countAffixMorphemes(pos: string | undefined): number {
  if (!pos) return 0;
  return pos.split('+').filter((segment) => segment.trim().length > 0).length;
}

/** Bumps a frequency-derived tier up one level when the surface form itself
 * is morphologically heavy, regardless of how common its lemma is. Never
 * downgrades, and leaves 'unlisted' alone (already the "hardest" bucket). */
function escalateForComplexity(tier: VocabTier, morphComplexity: number): VocabTier {
  if (morphComplexity < MORPH_COMPLEXITY_ESCALATE_AT) return tier;
  if (tier === 'beginner') return 'intermediate';
  if (tier === 'intermediate') return 'advanced';
  return tier;
}

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

function toRarity(word: string, rank: number | null, total: number, pos?: string): WordRarity {
  const morphComplexity = countAffixMorphemes(pos);
  return {
    word,
    rank,
    percentile: rank !== null && total > 0 ? 1 - (rank - 1) / total : null,
    tier: escalateForComplexity(tierForRank(rank), morphComplexity),
    morphComplexity,
  };
}

/** `pos` is AraMorph's raw affix-analysis string for this exact surface
 * form, when the caller already has it (e.g. from a dictionary lookup's
 * `MorphologicalAnalysis`) -- optional, since not every caller has run
 * morphology on the word, and rarity should still degrade gracefully
 * (frequency rank only, no complexity escalation) rather than fail. */
export async function getWordRarity(word: string, pos?: string): Promise<WordRarity> {
  const { ranks, total } = await getFrequencyIndex();
  return toRarity(word, ranks.get(word) ?? null, total, pos);
}

/** Batch version for building a whole book's vocabulary index — cheap here
 * since the underlying index is just one shared in-memory Map either way,
 * but keeps callers symmetrical with the earlier per-row-lookup API.
 * `posByWord` mirrors `getWordRarity`'s optional `pos` -- per-word affix
 * analysis, when the caller has it (see bookVocabIndex.ts). */
export async function getWordRarities(words: string[], posByWord?: Map<string, string | undefined>): Promise<Map<string, WordRarity>> {
  const { ranks, total } = await getFrequencyIndex();
  const out = new Map<string, WordRarity>();
  for (const word of words) {
    out.set(word, toRarity(word, ranks.get(word) ?? null, total, posByWord?.get(word)));
  }
  return out;
}

/** Whether the user has opted in — persisted, so Settings/Vocab Levels
 * don't need to ask again next session (see `frequencyStore.ts`). This is
 * about *intent*, not whether the in-memory index has actually been built
 * yet this session (now a near-instant, synchronous step either way) —
 * callers that need data now should call `enableRarityData`/
 * `getWordRarity(ies)`, which build it on demand. */
export async function isRarityDataReady(): Promise<boolean> {
  return isEnabled();
}

/** Records the opt-in choice and builds the in-memory index for this
 * session (see frequencyIndex.ts — this is now cheap enough to not need
 * real progress reporting; `onProgress` fires once, immediately). */
export async function enableRarityData(onProgress?: (p: IngestProgress) => void): Promise<void> {
  await getFrequencyIndex(onProgress);
  await setEnabled();
}

export async function disableRarityData(): Promise<void> {
  await setDisabled();
}
