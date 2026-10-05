import type { DictionaryEntry } from '../../../types';
import { formatDefinition, verbPrefix } from './formatDefinition';
import type { PersonalRow } from './parse';

/**
 * `root` is the tapped word's root (from AraMorph); it is attached to verb articles so the
 * popup's verb-form info can list the root's other verbs, as it does for English entries.
 */
export function rowsToEntries(rows: Iterable<PersonalRow>, providerId: string, providerName: string, root?: string): DictionaryEntry[] {
  return Array.from(rows).map(([headword, definition]) => {
    const verb = verbPrefix(definition);
    return {
      providerId,
      providerName,
      headword,
      senses: formatDefinition(headword, definition),
      ...(verb ? { verbForm: verb.form, imperfectVowel: verb.vowel, lemma: headword, ...(root ? { root } : {}) } : {}),
    };
  });
}
