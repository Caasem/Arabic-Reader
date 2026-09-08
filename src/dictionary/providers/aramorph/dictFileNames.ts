/**
 * Shared between the main thread (Settings' file-picker UI) and the AraMorph
 * worker (which owns all the actual Dexie/IndexedDB and table-building
 * work) -- kept in its own module, separate from store.ts, so importing it
 * from the main thread doesn't also spin up a second, unused Dexie
 * connection there.
 */
export const DICT_FILE_NAMES = ['dictprefixes', 'dictstems', 'dictsuffixes', 'tableab', 'tableac', 'tablebc'] as const;
export type DictFileName = (typeof DICT_FILE_NAMES)[number];

/**
 * Matches a user-selected FileList against the six expected table names
 * (exact match, `.txt` suffix, or a fuzzy contains-match), reading each as
 * text. Throws with a clear message naming whatever's missing.
 */
export async function readDictFileList(fileList: FileList | File[]): Promise<Record<DictFileName, string>> {
  const files = Array.from(fileList);
  const byBase = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const texts = {} as Record<DictFileName, string>;
  const missing: string[] = [];
  for (const name of DICT_FILE_NAMES) {
    let match = byBase.get(name) || byBase.get(name + '.txt');
    if (!match) match = files.find((f) => f.name.toLowerCase().includes(name));
    if (!match) {
      missing.push(name);
      continue;
    }
    texts[name] = await match.text();
  }
  if (missing.length) {
    throw new Error(`Missing file(s) for: ${missing.join(', ')} — please select all six dictionary data files.`);
  }
  return texts;
}
