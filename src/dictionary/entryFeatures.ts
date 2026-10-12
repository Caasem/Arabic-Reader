import type { DictionaryEntry } from '../types';
import { traitsOf } from './providerTraits';
import { isTokenizedProvider } from './tokenizedProviders';

/**
 * What the popup does with an entry, decided here from the entry's shape and used by both the popup and the
 * conformance test (src/dictionary/conformance.test.ts), so the two cannot drift apart.
 */

/** Whether the entry's text can be picked word by word and saved as the meaning. */
export function canSelectWords(entry: DictionaryEntry): boolean {
  return isTokenizedProvider(entry.providerId) || !!traitsOf(entry.providerId).richSenses;
}

/** Whether a dictionary's entries fold: a list longer than this starts folded to the entry about the tapped word. */
export const FOLD_ABOVE = 3;

/** The entries of one dictionary that show before "Show all": all of them. */
export function visibleEntryIndexes(count: number, _about: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
