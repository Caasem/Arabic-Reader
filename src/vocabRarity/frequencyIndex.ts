/**
 * The word→rank index backing rarity tiers/badges. Built from a real
 * lemma-frequency ranking (~23,500 entries) derived from the Annotated
 * KSUCCA (King Saud University Corpus of Classical Arabic) -- 409 of its
 * 410 texts (all but the Qur'an file, which uses a different,
 * morpheme-segmented annotation scheme and is 0.15% of the corpus by token
 * count), ~44.6M content-word occurrences, counted by MADA+TOKAN-assigned
 * lemma rather than raw surface form so a word's rank reflects its actual
 * lexeme frequency instead of being fragmented across every inflected form
 * it happens to appear as. Each line lists every surface form actually
 * attested in the corpus for that lemma, most-frequent lemma first (see
 * public/vocab-list-data/SOURCE-README.md for the full build notes).
 *
 * At ~1.8MB, this is loaded via a dynamic `import()` of its virtual module
 * rather than a static top-level one -- this whole feature is opt-in (see
 * frequencyStore.ts), so a reader who never enables it in Settings should
 * never pay for parsing or even downloading this data. Rollup code-splits
 * it into its own chunk accordingly (same approach as the AlWasit
 * dictionary provider's data -- see that file's comment for the reasoning).
 * This replaced an earlier, much smaller hand-curated list ("The List",
 * ~5,300 entries), which itself had replaced the original CAMeL Arabic
 * Frequency Lists (11.4M words, ~65MB compressed, ~800MB in-memory Map,
 * 10-15s to parse per session) -- this version is bigger than "The List"
 * but still small enough to parse synchronously in well under a second
 * once loaded, so none of CAMeL's streaming/decompression/progress-
 * reporting complexity is needed here.
 */
import { normalize } from '../reader/tokenizer/arabicTokenizer';

export interface IngestProgress {
  linesProcessed: number;
  bytesProcessed: number;
}

interface FrequencyIndex {
  ranks: Map<string, number>;
  total: number;
}

let indexPromise: Promise<FrequencyIndex> | null = null;

// A line's headword column lists every surface form the corpus actually
// attested for that lemma -- e.g. a verb's row lists every inflected form
// (تكتب، كتبنا، سيكتبون، ...) that occurred, not just the bare lemma --
// separated by an Arabic comma or a slash. Each of those forms is a real
// word someone might actually encounter while reading, so all of them earn
// that entry's rank, not just the first.
const FORM_SPLIT_RE = /[،/]/;

function parse(vocabListTsv: string, onProgress?: (p: IngestProgress) => void): FrequencyIndex {
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
  onProgress?.({ linesProcessed: rank, bytesProcessed: vocabListTsv.length });
  return { ranks, total: rank };
}

/** Kicks off (or returns the already-built) index for this session. */
export function getFrequencyIndex(onProgress?: (p: IngestProgress) => void): Promise<FrequencyIndex> {
  if (!indexPromise) {
    indexPromise = import('virtual:vocab-list-data').then((mod) => parse(mod.default, onProgress));
  } else if (onProgress) {
    indexPromise.then((idx) => onProgress({ linesProcessed: idx.total, bytesProcessed: 0 }));
  }
  return indexPromise;
}
