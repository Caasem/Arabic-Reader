/**
 * The word→rank index backing rarity tiers/badges. Built from a personal,
 * hand-curated ~5,300-entry frequency-ordered vocabulary list ("The List")
 * embedded directly into the bundle at build time (see
 * `bundledVocabListPlugin` in vite.config.ts) -- this replaced an earlier
 * version backed by the CAMeL Arabic Frequency Lists, an 11.4M-word corpus
 * that had to be fetched (~65MB compressed) and parsed into a ~800MB
 * in-memory Map, taking 10-15 seconds per session even with the parse loop
 * yielding to the event loop periodically so the UI didn't fully freeze.
 * The replacement is small enough that none of that complexity earns its
 * keep any more: parsing ~5,300 lines is sub-millisecond, so this is a
 * plain synchronous build with no streaming, no decompression, and no
 * progress reporting worth doing.
 */
import vocabListTsv from 'virtual:vocab-list-data';
import { normalize } from '../reader/tokenizer/arabicTokenizer';

export interface IngestProgress {
  linesProcessed: number;
  bytesProcessed: number;
}

interface FrequencyIndex {
  ranks: Map<string, number>;
  total: number;
}

let index: FrequencyIndex | null = null;

// A line's headword column often lists more than one surface form for the
// same entry -- principal parts of a verb (كانَ، يَكونُ، الكَوْن), a
// singular/plural pair (أب، آباء), or masc/fem alternatives (أحَد/إحدى) --
// separated by an Arabic comma or a slash. Each of those forms is a real
// word someone might actually encounter while reading, so all of them earn
// that entry's rank, not just the first.
const FORM_SPLIT_RE = /[،/]/;

function build(): FrequencyIndex {
  const ranks = new Map<string, number>();
  const lines = vocabListTsv.split('\n');
  let rank = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    rank++;
    const head = line.slice(0, tab);
    for (const rawForm of head.split(FORM_SPLIT_RE)) {
      const form = normalize(rawForm.trim());
      if (form && !ranks.has(form)) ranks.set(form, rank);
    }
  }
  return { ranks, total: rank };
}

/** Kicks off (or returns the already-built) index for this session. Kept
 * async and progress-reporting-shaped for compatibility with existing
 * callers (Settings/VocabLevels), even though the build itself is now
 * synchronous and near-instant. */
export function getFrequencyIndex(onProgress?: (p: IngestProgress) => void): Promise<FrequencyIndex> {
  if (!index) index = build();
  onProgress?.({ linesProcessed: index.total, bytesProcessed: vocabListTsv.length });
  return Promise.resolve(index);
}
