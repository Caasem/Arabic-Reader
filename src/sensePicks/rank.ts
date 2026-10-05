import type { DictionaryEntry } from '../types';
import { senseKey } from './keys';

/** The reader's picks for one word in one book: dictionary id -> the meaning they chose there. */
export type WordPicks = ReadonlyMap<string, string>;

export interface RankedEntries {
  entries: DictionaryEntry[];
  /** `${providerId}:${senseKey}` for every pick that matched a meaning in these entries. */
  matched: Set<string>;
}

export const pickId = (providerId: string, key: string): string => `${providerId}:${key}`;

/**
 * Moves each picked meaning to the top of its dictionary: its entry goes first within that
 * dictionary's entries, and it goes first within its entry. Everything else keeps its order.
 * Dictionaries are never reordered among themselves, and a pick that matches nothing is ignored.
 * With no picks the same entries come back untouched.
 */
export function applyPicks(entries: DictionaryEntry[], picks: WordPicks): RankedEntries {
  const matched = new Set<string>();
  if (picks.size === 0) return { entries, matched };

  const marked = entries.map((entry) => {
    const wanted = picks.get(entry.providerId);
    const at = wanted ? entry.senses.findIndex((s) => senseKey(entry.providerId, entry.headword, s) === wanted) : -1;
    if (at === -1) return { entry, hit: false };
    matched.add(pickId(entry.providerId, wanted!));
    if (at === 0) return { entry, hit: true };
    const senses = [entry.senses[at], ...entry.senses.slice(0, at), ...entry.senses.slice(at + 1)];
    return { entry: { ...entry, senses }, hit: true };
  });

  // Within each dictionary's entries (they are consecutive), the entry that holds the pick goes first.
  const out: DictionaryEntry[] = [];
  let i = 0;
  while (i < marked.length) {
    let j = i;
    while (j < marked.length && marked[j].entry.providerId === marked[i].entry.providerId) j++;
    const run = marked.slice(i, j);
    const hit = run.filter((m) => m.hit);
    for (const m of [...hit, ...run.filter((m) => !m.hit)]) out.push(m.entry);
    i = j;
  }
  return { entries: out, matched };
}
