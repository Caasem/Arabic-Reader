import { repairCandidates, type Candidate, type KnownWords, type WordRanks } from './repair';

/** One more way to read the same word: tighter, sharper, or by another engine. */
export interface Attempt {
  /** Shown as where the answer came from ("a closer look", "Claude"). */
  label: string;
  run(): Promise<string | null>;
}

export interface Refined {
  word: string;
  /** True when no read was a word the dictionary knows. */
  suspect: boolean;
  /** Likely corrections, best first; only when suspect. */
  candidates: Candidate[];
  /** Where the final word came from: 'first read', or an attempt's label. */
  via: string;
  /** Everything that was read, in order, without repeats. */
  reads: string[];
}

const ARABIC_LETTERS = /[ء-يٮ-ۓۺ-ۿ]/g;

/** A read worth asking the dictionary about: at least two Arabic letters. */
const askable = (word: string) => (word.match(ARABIC_LETTERS)?.length ?? 0) >= 2;

/**
 * Settles a word read from a scan. The dictionary is the judge: the first read is kept if it is a word;
 * otherwise each further attempt (a tighter crop, then other engines) is tried in turn and the first
 * that gives a real word wins. If none does, the word is marked suspect and the likeliest corrections
 * are worked out from everything that was read, so the popup can offer them.
 */
export async function refineRead(first: string, attempts: Attempt[], known: KnownWords, ranks?: WordRanks): Promise<Refined> {
  const reads = [first];
  const knownAmong = async (words: string[]) => {
    const asked = words.filter(askable);
    return asked.length ? known(asked) : new Set<string>();
  };

  if ((await knownAmong([first])).has(first)) return { word: first, suspect: false, candidates: [], via: 'first read', reads };

  for (const attempt of attempts) {
    let next: string | null = null;
    try {
      next = await attempt.run();
    } catch {
      continue;
    }
    if (!next || reads.includes(next)) continue;
    reads.push(next);
    if ((await knownAmong([next])).has(next)) return { word: next, suspect: false, candidates: [], via: attempt.label, reads };
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const read of reads) {
    for (const c of await repairCandidates(read, knownAmong, ranks, 4)) {
      if (!seen.has(c.word)) {
        seen.add(c.word);
        candidates.push(c);
      }
    }
  }
  candidates.sort((a, b) => a.weight - b.weight);
  return { word: first, suspect: true, candidates: candidates.slice(0, 3), via: 'first read', reads };
}
