import type { DictionaryEntry } from '../types';
import { entryKey, senseKey } from './keys';

/** One entry the reader saved for this word in this book, and optionally the one meaning inside it. */
export interface WordPick {
  providerId: string;
  entryKey: string;
  senseKey?: string | null;
}
export type WordPicks = readonly WordPick[];

export interface RankedEntries {
  entries: DictionaryEntry[];
  /** `${providerId}:${entryKey}` for every pick that matched an entry in these entries. */
  matched: Set<string>;
}

export const pickId = (providerId: string, key: string): string => `${providerId}:${key}`;

/**
 * Puts the entries the reader saved first within their dictionary, keeping every other entry (and the
 * saved ones among themselves) in their original order. When a finer save also named one meaning, that
 * meaning goes first inside its entry. Dictionaries are never reordered among themselves, and a pick
 * that matches nothing is ignored. With no picks the same entries come back untouched.
 */
export function applyPicks(entries: DictionaryEntry[], picks: WordPicks): RankedEntries {
  const matched = new Set<string>();
  if (picks.length === 0) return { entries, matched };
  const byEntry = new Map(picks.map((p) => [pickId(p.providerId, p.entryKey), p]));

  const marked = entries.map((entry) => {
    const id = pickId(entry.providerId, entryKey(entry));
    const pick = byEntry.get(id);
    if (!pick) return { entry, hit: false };
    matched.add(id);
    if (!pick.senseKey) return { entry, hit: true };
    const at = entry.senses.findIndex((s) => senseKey(entry.providerId, entry.headword, s) === pick.senseKey);
    if (at <= 0) return { entry, hit: true };
    return { entry: { ...entry, senses: [entry.senses[at], ...entry.senses.slice(0, at), ...entry.senses.slice(at + 1)] }, hit: true };
  });

  // A dictionary's entries are consecutive; within each run, saved entries go first.
  const out: DictionaryEntry[] = [];
  let i = 0;
  while (i < marked.length) {
    let j = i;
    while (j < marked.length && marked[j].entry.providerId === marked[i].entry.providerId) j++;
    const run = marked.slice(i, j);
    for (const m of [...run.filter((m) => m.hit), ...run.filter((m) => !m.hit)]) out.push(m.entry);
    i = j;
  }
  return { entries: out, matched };
}
