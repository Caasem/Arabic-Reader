import type { DictionaryEntry } from '../types';
import { entryGist } from './entryGist';
import type { DockItem } from './EntryDock';

/**
 * The dock's tabs for a lookup: for every dictionary whose entries sit under more than one root (a word with
 * several roots, or a Lane article with its neighbours'), one tab per root, pointing at that root's first entry.
 * Decided from the entries alone, so any dictionary gets it.
 */
export function dockItemsFor(groups: { providerId: string; providerName: string; entries: { entry: DictionaryEntry; index: number }[] }[]): DockItem[] {
  const items: DockItem[] = [];
  for (const group of groups) {
    const firstOfRoot = new Map<string, { entry: DictionaryEntry; index: number }>();
    for (const item of group.entries) {
      const root = item.entry.root;
      if (root && !firstOfRoot.has(root)) firstOfRoot.set(root, item);
    }
    if (firstOfRoot.size < 2) continue;
    for (const [root, { entry, index }] of firstOfRoot) {
      items.push({ index, headword: root, gist: entryGist(entry.senses[0]?.gloss ?? ''), group: group.providerName });
    }
  }
  return items;
}
