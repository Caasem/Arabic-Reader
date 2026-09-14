/**
 * The word -> rank index behind rarity tiers: a lemma-frequency ranking
 * (~23,500 lemmas) derived from the Annotated KSUCCA corpus of Classical
 * Arabic (see public/vocab-list-data/SOURCE-README.md). Each line lists every
 * surface form attested for a lemma, most frequent lemma first, and every
 * form earns that lemma's rank.
 *
 * Loaded with a dynamic import() so the ~6MB dataset is its own chunk, only
 * downloaded by readers who enable Vocabulary Levels.
 */
import { normalize } from '../reader/tokenizer/arabicTokenizer';

interface FrequencyIndex {
  ranks: Map<string, number>;
  total: number;
}

let indexPromise: Promise<FrequencyIndex> | null = null;

/** Forms in the headword column are separated by an Arabic comma or a slash. */
const FORM_SPLIT_RE = /[،/]/;

function parse(vocabListTsv: string): FrequencyIndex {
  const ranks = new Map<string, number>();
  let rank = 0;
  for (const line of vocabListTsv.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1 || !line.trim()) continue;
    rank++;
    for (const rawForm of line.slice(0, tab).split(FORM_SPLIT_RE)) {
      const form = normalize(rawForm.trim());
      if (form && !ranks.has(form)) ranks.set(form, rank);
    }
  }
  return { ranks, total: rank };
}

/** Builds (once per session) or returns the index. */
export function getFrequencyIndex(): Promise<FrequencyIndex> {
  if (!indexPromise) {
    indexPromise = import('virtual:vocab-list-data').then((mod) => parse(mod.default));
    indexPromise.catch(() => {
      indexPromise = null; // allow a retry, e.g. after coming back online
    });
  }
  return indexPromise;
}
