/**
 * Optimal Recognition Point (ORP) — RSVP apps keep one letter of each word
 * aligned to a fixed screen position (roughly where a reader's eye would
 * naturally land first) so the eye never has to move between words, only
 * the display has to change. This module only ever *slices* the original
 * string into ordered pieces (before / pivot / after) — it never reverses
 * or reorders characters, so native Arabic shaping, ligatures, and RTL
 * bidi rendering are left entirely to the browser. The caller renders the
 * three pieces inside a `direction: rtl` layout (see RsvpWord.tsx) so the
 * "before" piece — read first — lands on the right, matching normal Arabic
 * reading order, exactly as it would un-split.
 *
 * Splitting happens on *grapheme-ish clusters* (a base letter plus any
 * combining diacritics immediately after it — tashkīl/harakat), not raw
 * string indices: Arabic words are frequently half diacritics by character
 * count, and slicing by raw index would land the pivot mid-diacritic-stack
 * or off by a letter depending on how heavily a given word is vocalized.
 */

/** Arabic combining diacritics (harakat, tanwin, sukun, shadda, etc.) —
 * same range used by the tokenizer's own diacritic-stripping. These never
 * start a new visual cluster; they attach to the preceding base character. */
const COMBINING_MARK_RE = /[ً-ٰۖ-ۭ]/;

export interface OrpSplit {
  before: string;
  pivot: string;
  after: string;
}

/** Groups a string into clusters of "one base character + trailing combining
 * marks" so a diacritic never gets separated from the letter it belongs to. */
function clusterize(word: string): string[] {
  const clusters: string[] = [];
  for (const ch of word) {
    if (COMBINING_MARK_RE.test(ch) && clusters.length > 0) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}

/** Standard RSVP pivot-letter heuristic (roughly the approach popularized
 * by Spritz-style readers): pivot creeps rightward as the word gets longer,
 * settling around 30-35% of the way through very long words. Counted in
 * clusters (letters), not raw characters, so heavy vocalization doesn't
 * skew it. */
function pivotClusterIndex(clusterCount: number): number {
  if (clusterCount <= 1) return 0;
  if (clusterCount <= 5) return 1;
  if (clusterCount <= 9) return 2;
  if (clusterCount <= 13) return 3;
  return Math.min(clusterCount - 1, Math.floor(clusterCount * 0.3));
}

/**
 * Computes the ORP split for a displayed RSVP token. Returns `null` — a
 * graceful fallback to plain centered rendering — whenever a stable pivot
 * wouldn't be meaningful: an empty token, or one with only a single letter
 * cluster (nothing to anchor around).
 */
export function computeOrpSplit(word: string): OrpSplit | null {
  const trimmed = word.trim();
  if (!trimmed) return null;

  const clusters = clusterize(trimmed);
  if (clusters.length <= 1) return null;

  const pivotIndex = pivotClusterIndex(clusters.length);
  const before = clusters.slice(0, pivotIndex).join('');
  const pivot = clusters[pivotIndex];
  const after = clusters.slice(pivotIndex + 1).join('');

  return { before, pivot, after };
}
