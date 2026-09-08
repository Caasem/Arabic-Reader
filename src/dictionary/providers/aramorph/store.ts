import Dexie, { type Table } from 'dexie';

/**
 * The AraMorph data files (dictprefixes/dictstems/dictsuffixes + the three
 * grammar tables) are GPL-2.0 licensed data (LDC/QAMUS), the same six files
 * the browser extension and the vanilla-JS reader prototype use. They now
 * ship bundled under `public/dictionary-data/` (see `fetchBundledDictFiles`
 * below) so the app has a real default dictionary out of the box — the
 * accompanying `gpl.txt`/`GPL.redistributable.txt` in that same folder are
 * what satisfy the GPL's "keep the license with the data" requirement, and
 * must keep traveling with these files.
 *
 * A user can still supply their own copy through Settings (e.g. a newer or
 * differently-licensed dataset); this Dexie database is where that upload
 * — or a first-run copy of the bundled files — gets cached, so parsing
 * ~136k dictionary entries only happens once, not on every page load.
 */
export const DICT_FILE_NAMES = ['dictprefixes', 'dictstems', 'dictsuffixes', 'tableab', 'tableac', 'tablebc'] as const;
export type DictFileName = (typeof DICT_FILE_NAMES)[number];

class AramorphFilesDB extends Dexie {
  files!: Table<{ name: string; content: string }, string>;
  constructor() {
    super('arabic-reader-aramorph-files');
    this.version(1).stores({ files: 'name' });
  }
}

const db = new AramorphFilesDB();

export async function saveDictFiles(texts: Record<DictFileName, string>): Promise<void> {
  await db.transaction('rw', db.files, async () => {
    for (const name of DICT_FILE_NAMES) {
      await db.files.put({ name, content: texts[name] });
    }
  });
}

export async function loadCachedDictFiles(): Promise<Record<DictFileName, string> | null> {
  const rows = await db.files.toArray();
  const byName = new Map(rows.map((r) => [r.name, r.content]));
  const texts: Partial<Record<DictFileName, string>> = {};
  for (const name of DICT_FILE_NAMES) {
    const content = byName.get(name);
    if (!content) return null;
    texts[name] = content;
  }
  return texts as Record<DictFileName, string>;
}

export async function clearDictFiles(): Promise<void> {
  await db.files.clear();
}

/**
 * Fetches the bundled default dataset from `public/dictionary-data/` (served
 * at `/dictionary-data/<name>` in both dev and production builds). Returns
 * null rather than throwing if the bundle is missing or a fetch fails, so
 * callers can fall back gracefully (e.g. to "no dictionary loaded yet")
 * instead of crashing app startup over a 404.
 */
export async function fetchBundledDictFiles(): Promise<Record<DictFileName, string> | null> {
  try {
    const entries = await Promise.all(
      DICT_FILE_NAMES.map(async (name) => {
        const res = await fetch(`/dictionary-data/${name}`);
        if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
        return [name, await res.text()] as const;
      })
    );
    return Object.fromEntries(entries) as Record<DictFileName, string>;
  } catch {
    return null;
  }
}

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
