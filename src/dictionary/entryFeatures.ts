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

/**
 * Which of one dictionary's entries (their indexes in the lookup result) show before "Show all N entries": all
 * of a short list; of a long one, the entries about the tapped word (see entriesAboutWord), else the first.
 */
export function visibleEntryIndexes(indexes: readonly number[], about: ReadonlySet<number>): number[] {
  if (indexes.length <= FOLD_ABOVE) return [...indexes];
  const matched = indexes.filter((i) => about.has(i));
  return matched.length ? matched : [indexes[0]];
}
