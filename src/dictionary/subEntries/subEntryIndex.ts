import type { RootArticleData, RootArticleRow } from '../providers/rootArticle/rootArticleData';
import { hasSubEntryIndex, unitHead } from './heads';
import { containsRoot } from './keys';
import { bestMatches, isFunctionWord, wantedKeys, type AnalysisLike } from './match';

/**
 * Headword key -> where the dictionary files it: packed `rowId * UNIT_SLOTS + unit` (the row's line number
 * and the sub-entry's position in it). Built once per parsed dictionary, the first time a word needs it.
 */
export type SubEntryIndex = Map<string, number[]>;

const UNIT_SLOTS = 4096;
/** A headword is read from the start of its line; this much is plenty and spares slicing whole paragraphs. */
const HEAD_CHARS = 300;
/** A headword filed under more roots than this is too ambiguous to pick an article by. */
export const MAX_FALLBACK_ROOTS = 2;

const cache = new WeakMap<RootArticleData, { index: SubEntryIndex; rowsById: Map<number, RootArticleRow> }>();

/** Every row once, in file order. */
function uniqueRows(data: RootArticleData): RootArticleRow[] {
  const rows = new Map<number, RootArticleRow>();
  for (const list of data.byKey.values()) for (const row of list) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.id - b.id);
}

export function buildSubEntryIndex(data: RootArticleData, providerId: string): SubEntryIndex {
  const index: SubEntryIndex = new Map();
  if (!hasSubEntryIndex(providerId)) return index;
  for (const row of uniqueRows(data)) {
    const roots = row.word.split('|').map((r) => r.trim());
    const text = row.meanings;
    let unit = 0;
    for (let start = 0; start <= text.length; ) {
      let end = text.indexOf('<br>', start);
      if (end === -1) end = text.length;
      const chunk = text.slice(start, Math.min(end, start + HEAD_CHARS)).trim();
      start = end + 4;
      if (!chunk) continue; // rowToEntry drops empty units, so they take no position
      const head = unitHead(providerId, chunk, roots[0], unit);
      const position = unit++;
      if (!head || head.crossRef || position >= UNIT_SLOTS) continue;
      for (const key of head.keys) {
        // Only a headword built on the article's root letters says where the word is filed: this drops
        // example phrases and the conjunctions and particles some lines open with.
        // Two-letter keys are left out too: too many words and particles share them (Al-Ṣiḥāḥ's وجى read as و + جى).
        if (key.length < 3 || !roots.some((r) => containsRoot(key, r))) continue;
        const packed = row.id * UNIT_SLOTS + position;
        const list = index.get(key);
        if (!list) index.set(key, [packed]);
        else if (!list.includes(packed)) list.push(packed);
      }
    }
  }
  return index;
}

function cached(data: RootArticleData, providerId: string) {
  let entry = cache.get(data);
  if (!entry) {
    entry = { index: buildSubEntryIndex(data, providerId), rowsById: new Map(uniqueRows(data).map((r) => [r.id, r])) };
    cache.set(data, entry);
  }
  return entry;
}

/** The dictionary's index, built on first use and kept as long as its parsed data. */
export function subEntryIndex(data: RootArticleData, providerId: string): SubEntryIndex {
  return cached(data, providerId).index;
}

/** The rows a key is filed under, each once. */
function rowIdsFor(index: SubEntryIndex, key: string): number[] {
  return [...new Set((index.get(key) ?? []).map((p) => Math.floor(p / UNIT_SLOTS)))];
}

/**
 * The articles a word is filed under as a sub-entry, for a word AraMorph gave no (findable) root: the word
 * itself, without the article, and its lemmas first; only if none is filed anywhere and AraMorph doesn't know
 * the word, the word without a one-letter clitic. Function words are never looked up this way. A key filed under more than MAX_FALLBACK_ROOTS articles is skipped as ambiguous, and at
 * most that many articles are returned.
 */
export function findRowsBySubEntry(data: RootArticleData, providerId: string, word: string, analyses: AnalysisLike[]): RootArticleRow[] {
  if (!hasSubEntryIndex(providerId)) return [];
  // Particles and pronouns share spellings with words of some root (لأن، لان): they are filed nowhere.
  if (analyses.length && analyses.every(isFunctionWord)) return [];
  const { index, rowsById } = cached(data, providerId);
  const wanted = wantedKeys(word, analyses);
  // Clitic guesses only for a word AraMorph doesn't know at all: when it does, its lemmas already
  // have the clitics off, and a guess would read بارما (Parma) as ب + ارما.
  for (const tier of analyses.length ? [wanted.exact] : [wanted.exact, wanted.loose]) {
    const ids: number[] = [];
    for (const key of tier) {
      const found = rowIdsFor(index, key);
      if (found.length > MAX_FALLBACK_ROOTS) continue;
      for (const id of found) if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length) return ids.slice(0, MAX_FALLBACK_ROOTS).map((id) => rowsById.get(id)!);
  }
  return [];
}

/**
 * Several articles found by root: the ones with a sub-entry for the word itself (or a lemma of it) lead,
 * the rest keep their order (AraMorph's: the leading reading's root first).
 */
export function orderBySubEntry<R extends RootArticleRow>(rows: R[], providerId: string, word: string, analyses: AnalysisLike[]): R[] {
  if (rows.length < 2 || !hasSubEntryIndex(providerId)) return rows;
  const wanted = wantedKeys(word, analyses);
  const hit = (row: R) => {
    const root = row.word.split('|')[0].trim();
    const units = row.meanings.split('<br>').map((u) => u.trim()).filter(Boolean);
    const heads = units.map((u, i) => unitHead(providerId, u.slice(0, HEAD_CHARS), root, i));
    return bestMatches(heads, wanted, providerId, root).tier >= 2;
  };
  const withHit = rows.filter(hit);
  return withHit.length === 0 || withHit.length === rows.length ? rows : [...withHit, ...rows.filter((r) => !withHit.includes(r))];
}
