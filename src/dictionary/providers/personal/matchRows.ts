import type { DictionaryEntry } from '../../../types';
import { foldAlefHamza } from '../../../reader/tokenizer/arabicTokenizer';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';
import { keyTiers } from './keyTiers';
import { formatDefinition } from './formatDefinition';
import type { PersonalIndex } from './index';
import type { PersonalRow } from './parse';

/**
 * Rows whose headword matches the tapped word, or the roots and dictionary forms
 * AraMorph finds for it (as Al-Wasit does), best match first: the word itself, then
 * its dictionary forms, then its roots. Falls back to alef/hamza-folded keys.
 */
export async function matchRows(idx: PersonalIndex, word: string): Promise<PersonalRow[]> {
  let analyses: Awaited<ReturnType<typeof aramorphProvider.analyze>> = [];
  try {
    analyses = await aramorphProvider.analyze(word);
  } catch {
    // AraMorph unavailable -- match the raw surface form only.
  }
  const tiers = keyTiers(word, analyses);

  const found = new Map<PersonalRow, number>();
  tiers.forEach((keys, tier) => {
    for (const key of keys) for (const row of idx.byKey.get(key) ?? []) if (!found.has(row)) found.set(row, tier);
  });
  if (found.size === 0) {
    tiers.forEach((keys, tier) => {
      for (const key of keys) for (const row of idx.byFoldedKey.get(foldAlefHamza(key)) ?? []) if (!found.has(row)) found.set(row, tier);
    });
  }
  return Array.from(found.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([row]) => row);
}

export function rowsToEntries(rows: Iterable<PersonalRow>, providerId: string, providerName: string): DictionaryEntry[] {
  return Array.from(rows).map(([headword, definition]) => ({
    providerId,
    providerName,
    headword,
    senses: formatDefinition(headword, definition),
  }));
}
