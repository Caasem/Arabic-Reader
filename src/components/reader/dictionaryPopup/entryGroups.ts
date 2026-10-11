import type { DictionaryEntry } from '../../../types';

export type EntryGroup = { providerId: string; providerName: string; entries: { entry: DictionaryEntry; index: number }[] };

/** Folds consecutive same-provider entries into one group so the popup can
 * show the provider name once per group instead of once per entry. Keeps
 * each entry's original index (needed for the per-entry save-state Set,
 * which is keyed by position in the flat `result.entries` array). */
export function groupEntriesByProvider(entries: DictionaryEntry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const last = groups[groups.length - 1];
    if (last && last.providerId === entry.providerId) {
      last.entries.push({ entry, index: i });
    } else {
      groups.push({ providerId: entry.providerId, providerName: entry.providerName, entries: [{ entry, index: i }] });
    }
  }
  return groups;
}
