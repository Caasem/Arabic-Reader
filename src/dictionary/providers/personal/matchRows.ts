import { foldAlefHamza } from '../../../reader/tokenizer/arabicTokenizer';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';
import { keyTiers } from './keyTiers';
import { vowelScore } from './vowels';
import type { PersonalIndex } from './index';
import type { PersonalRow } from './parse';

/**
 * Rows whose headword matches the tapped word, or the roots and dictionary forms
 * AraMorph finds for it (as Al-Wasit does), best match first: the word itself, then
 * its dictionary forms, then its roots. Falls back to alef/hamza-folded keys.
 */
export async function matchRows(idx: PersonalIndex, word: string): Promise<{ rows: PersonalRow[]; root?: string }> {
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
  // Same tier: a headword whose vowels match the tapped word's comes first (homographs).
  const root = analyses.find((a) => a.root && a.root !== '---')?.root;
  const rows = Array.from(found.entries())
    .map(([row, tier]) => ({ row, tier, vowels: tier === 0 ? vowelScore(word, row[0]) : 2 }))
    .sort((a, b) => a.tier - b.tier || a.vowels - b.vowels)
    .map((x) => x.row);
  return { rows, root };
}
