import { normalize } from '../reader/tokenizer/arabicTokenizer';

/** A run of headwords around one, in the dictionary's own order, and which one is current. */
export interface HeadwordWindow {
  words: string[];
  index: number;
}

interface Row {
  id: number;
  word: string;
}

const orderCache = new WeakMap<Map<string, Row[]>, { words: string[]; positionOfId: Map<number, number> }>();

/** Every row's headword once, in file order (the dictionary's order: by root for the classical ones). */
function ordered(byKey: Map<string, Row[]>) {
  let cached = orderCache.get(byKey);
  if (!cached) {
    const rows = new Map<number, Row>();
    for (const list of byKey.values()) for (const row of list) rows.set(row.id, row);
    const sorted = [...rows.values()].sort((a, b) => a.id - b.id);
    const positionOfId = new Map<number, number>();
    sorted.forEach((row, i) => positionOfId.set(row.id, i));
    cached = { words: sorted.map((row) => row.word.split('|')[0].trim()), positionOfId };
    orderCache.set(byKey, cached);
  }
  return cached;
}

/**
 * The headwords before and after `around` in a root-filed dictionary (rows keyed by their
 * headword, `|`-separated variants allowed). Null when `around` is not a headword there.
 */
export function headwordWindow(byKey: Map<string, Row[]>, around: string, before: number, after: number): HeadwordWindow | null {
  const row = byKey.get(normalize(around.split('|')[0].trim()))?.[0];
  if (!row) return null;
  const { words, positionOfId } = ordered(byKey);
  const at = positionOfId.get(row.id)!;
  const start = Math.max(0, at - before);
  return { words: words.slice(start, at + after + 1), index: at - start };
}
