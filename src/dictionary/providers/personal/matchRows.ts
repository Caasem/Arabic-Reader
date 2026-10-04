import type { DictionaryEntry } from '../../../types';
import { foldAlefHamza } from '../../../reader/tokenizer/arabicTokenizer';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';
import { buildLookupKeys } from '../alwasit/lookupKeys';
import type { PersonalIndex } from './index';
import type { PersonalRow } from './parse';

/**
 * Rows whose headword matches the tapped word, or the roots and dictionary forms
 * AraMorph finds for it (as Al-Wasit does). Falls back to alef/hamza-folded keys.
 */
export async function matchRows(idx: PersonalIndex, word: string): Promise<Set<PersonalRow>> {
  let analyses: Awaited<ReturnType<typeof aramorphProvider.analyze>> = [];
  try {
    analyses = await aramorphProvider.analyze(word);
  } catch {
    // AraMorph unavailable -- match the raw surface form only.
  }
  const keys = buildLookupKeys(word, analyses);

  const matched = new Set<PersonalRow>();
  for (const key of keys) for (const row of idx.byKey.get(key) ?? []) matched.add(row);
  if (matched.size === 0) {
    for (const key of keys) for (const row of idx.byFoldedKey.get(foldAlefHamza(key)) ?? []) matched.add(row);
  }

  return matched;
}

export function rowsToEntries(rows: Iterable<PersonalRow>, providerId: string, providerName: string): DictionaryEntry[] {
  return Array.from(rows).map(([headword, definition]) => ({
    providerId,
    providerName,
    headword,
    senses: definition
      .split(/<br\s*\/?>|\n/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((gloss) => ({ gloss })),
  }));
}
