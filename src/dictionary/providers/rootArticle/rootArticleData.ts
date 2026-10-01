import type { DictionaryEntry } from '../../../types';
import { foldAlefHamza, normalize } from '../../../reader/tokenizer/arabicTokenizer';

/**
 * A dictionary filed by root: one row per root, its sub-entries (lines or
 * paragraphs) joined with `<br>` -- the shape of public/alsihah-data and
 * public/almaqayis-data (see scripts/extract-lexicon-data.py), and of Al-Wasit's.
 */
export interface RootArticleRow {
  id: number;
  /** The root, e.g. "وفى". A `|` would list homograph spellings, each a valid key. */
  word: string;
  /** `<br>`-separated sub-entries; plain Arabic text otherwise. */
  meanings: string;
}

export interface RootArticleData {
  byKey: Map<string, RootArticleRow[]>;
  /** The same rows with alef/hamza variants folded to ا -- a fallback only,
   * for a root the dictionary spells with hamza-on-alef (مرأ) that AraMorph
   * resolved without it (مرا). */
  byFoldedKey: Map<string, RootArticleRow[]>;
}

export function parseRootArticleTsv(raw: string): RootArticleData {
  const byKey = new Map<string, RootArticleRow[]>();
  const byFoldedKey = new Map<string, RootArticleRow[]>();
  const addTo = (map: Map<string, RootArticleRow[]>, key: string, row: RootArticleRow) => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const row: RootArticleRow = { id: i, word: line.slice(0, tab), meanings: line.slice(tab + 1) };
    for (const part of row.word.split('|')) {
      const key = normalize(part.trim());
      if (!key) continue;
      addTo(byKey, key, row);
      addTo(byFoldedKey, foldAlefHamza(key), row);
    }
  }
  return { byKey, byFoldedKey };
}

/** Rows filed under any of `keys`; the alef/hamza-folded index is tried only when nothing matched exactly. */
export function findRows(data: RootArticleData, keys: Iterable<string>): RootArticleRow[] {
  const matched = new Map<number, RootArticleRow>();
  for (const key of keys) for (const row of data.byKey.get(key) ?? []) matched.set(row.id, row);
  if (matched.size === 0) {
    for (const key of keys) for (const row of data.byFoldedKey.get(foldAlefHamza(key)) ?? []) matched.set(row.id, row);
  }
  return Array.from(matched.values());
}

export function rowToEntry(row: RootArticleRow, provider: { id: string; name: string }): DictionaryEntry {
  const headword = row.word.split('|')[0].trim();
  return {
    providerId: provider.id,
    providerName: provider.name,
    headword,
    root: headword,
    senses: row.meanings
      .split(/<br\s*\/?>/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((gloss) => ({ gloss })),
  };
}
