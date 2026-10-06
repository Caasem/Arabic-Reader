import type { DictionaryEntry } from '../types';
import { entryKey, senseKey } from '../sensePicks/keys';

/** What a ranking file says about one word in one dictionary (docs/specs/crowd-sense-ranking.md, section 9.3). */
export interface WordRanking {
  entries: string[];
  bestEntry: string;
  senses?: Record<string, { order: string[]; best: string }>;
}

/** Stable sort by a position map: listed items in listed order, then every other item in its original order. */
function byListedOrder<T>(items: T[], order: string[], keyOf: (item: T) => string): T[] {
  const at = new Map(order.map((k, i) => [k, i]));
  const listed = items.map((item, i) => ({ item, i, at: at.get(keyOf(item)) })).filter((x) => x.at !== undefined);
  const rest = items.filter((item) => !at.has(keyOf(item)));
  listed.sort((a, b) => (a.at as number) - (b.at as number) || a.i - b.i);
  return [...listed.map((x) => x.item), ...rest];
}

/**
 * Reorders a lookup by the crowd's ranking: within each dictionary, the ranked entries come first in their ranked
 * order and every other entry keeps its place after them; inside an entry, ranked meanings come first the same way.
 * Dictionaries are never reordered among themselves, an entry or meaning the ranking does not know is kept, and with
 * no ranking the same array comes back (section 10).
 */
export function applyWordRanking(entries: DictionaryEntry[], byProvider: Record<string, WordRanking | undefined>): DictionaryEntry[] {
  if (Object.keys(byProvider).length === 0) return entries;
  const out: DictionaryEntry[] = [];
  let changed = false;
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j < entries.length && entries[j].providerId === entries[i].providerId) j++;
    const run = entries.slice(i, j);
    const ranking = byProvider[entries[i].providerId];
    if (!ranking) {
      out.push(...run);
    } else {
      const ordered = byListedOrder(run, ranking.entries, (e) => entryKey(e)).map((entry) => {
        const senses = ranking.senses?.[entryKey(entry)];
        if (!senses) return entry;
        const reordered = byListedOrder(entry.senses, senses.order, (s) => senseKey(entry.providerId, entry.headword, s));
        return reordered.every((s, n) => s === entry.senses[n]) ? entry : { ...entry, senses: reordered };
      });
      if (ordered.some((e, n) => e !== run[n])) changed = true;
      out.push(...ordered);
    }
    i = j;
  }
  return changed ? out : entries;
}
