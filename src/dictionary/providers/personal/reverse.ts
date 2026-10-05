import { formatDefinition } from './formatDefinition';
import type { PersonalRow } from './parse';

const WORD_RE = /[Ѐ-ӿ]+(?:-[Ѐ-ӿ]+)*/g;
const MAX_RESULTS = 60;
const MAX_PREFIX_WORDS = 3000;

interface Postings {
  /** Rows where the word is part of the sense itself (not an example). */
  head: Set<number>;
  /** Rows where the word opens a sense ("книга; письмо" leads with книга). */
  lead: Set<number>;
  all: Set<number>;
}

export interface ReverseIndex {
  rows: PersonalRow[];
  words: Map<string, Postings>;
  /** Unique words, sorted, for prefix scans. */
  sorted: string[];
}

export const russianWords = (text: string): string[] => (text.toLowerCase().replace(/ё/g, 'е').match(WORD_RE) ?? []).filter((w) => w.length > 1);

/** Word -> rows index over the Russian text of each article. */
export function buildReverseIndex(rows: PersonalRow[]): ReverseIndex {
  const words = new Map<string, Postings>();
  const post = (word: string): Postings => {
    let p = words.get(word);
    if (!p) words.set(word, (p = { head: new Set(), lead: new Set(), all: new Set() }));
    return p;
  };
  rows.forEach(([headword, definition], id) => {
    for (const sense of formatDefinition(headword, definition)) {
      russianWords(sense.gloss).forEach((w, wi) => {
        const p = post(w);
        if (wi === 0) p.lead.add(id);
        p.head.add(id);
        p.all.add(id);
      });
      for (const ex of sense.examples ?? []) for (const w of russianWords(ex.gloss)) post(w).all.add(id);
    }
  });
  return { rows, words, sorted: Array.from(words.keys()).sort() };
}

/** Index of the first sorted word >= prefix. */
function lowerBound(sorted: string[], prefix: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Rows for a Russian word or phrase, best first. Per word: the word opening a sense (-1), the exact word in a sense (0),
 * in an example (1); a longer word starting with it, in the sense (2), in an example (3); and
 * for words of 6+ letters, a word sharing all but the last two letters in the sense (4), which
 * catches other endings. A phrase needs every word; scores add up.
 */
export function reverseSearch(index: ReverseIndex, query: string): PersonalRow[] {
  const tokens = russianWords(query);
  if (!tokens.length) return [];
  let scores: Map<number, number> | undefined;
  for (const token of tokens) {
    const mine = new Map<number, number>();
    const give = (ids: Iterable<number>, score: number) => {
      for (const id of ids) if (!(mine.has(id) && mine.get(id)! <= score)) mine.set(id, score);
    };
    const exact = index.words.get(token);
    if (exact) {
      give(exact.lead, -1);
      give(exact.head, 0);
      give(exact.all, 1);
    }
    const scan = (prefix: string, headScore: number, allScore: number) => {
      let n = 0;
      for (let i = lowerBound(index.sorted, prefix); i < index.sorted.length && index.sorted[i].startsWith(prefix) && n < MAX_PREFIX_WORDS; i++, n++) {
        const p = index.words.get(index.sorted[i])!;
        give(p.head, headScore);
        give(p.all, allScore);
      }
    };
    scan(token, 2, 3);
    if (token.length >= 6) scan(token.slice(0, -2), 4, 5);
    const prev: Map<number, number> | undefined = scores;
    scores = prev ? new Map(Array.from(prev).filter(([id]) => mine.has(id)).map(([id, sc]): [number, number] => [id, sc + mine.get(id)!])) : mine;
    if (!scores.size) return [];
  }
  return Array.from((scores as Map<number, number>).entries())
    .sort((a, b) => a[1] - b[1] || index.rows[a[0]][1].length - index.rows[b[0]][1].length || a[0] - b[0])
    .slice(0, MAX_RESULTS)
    .map(([id]) => index.rows[id]);
}
