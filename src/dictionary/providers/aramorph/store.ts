import Dexie, { type Table } from 'dexie';
import { DICT_FILE_NAMES, type DictFileName } from './dictFileNames';

/**
 * The AraMorph data files (dictprefixes/dictstems/dictsuffixes + the three
 * grammar tables) are GPL-2.0 licensed data (LDC/QAMUS), the same six files
 * the browser extension and the vanilla-JS reader prototype use. They ship
 * bundled under `public/dictionary-data/` (also embedded directly into the
 * AraMorph worker's bundle at build time -- see `virtual:dictionary-data` in
 * vite.config.ts -- so the default dictionary needs no network fetch at
 * runtime) so the app has a real default dictionary out of the box.
 *
 * This module is imported only from the AraMorph worker (aramorph.worker.ts)
 * -- it owns the one Dexie connection used to cache a *custom* uploaded
 * dataset (Settings' "Upload custom files"), so parsing a re-uploaded
 * dataset only happens once, not on every page load.
 */
class AramorphFilesDB extends Dexie {
  files!: Table<{ name: string; content: string }, string>;
  // Single-row cache ('current' is the only id ever used) of whichever
  // dataset (bundled or custom-uploaded) was last *parsed*, keyed by a
  // fingerprint of its source text so a different dataset (a custom upload
  // replacing the bundled default, or a build shipping updated dictionary
  // data) is detected as a miss and rebuilt rather than serving stale
  // tables. See aramorph.worker.ts.
  parsedTables!: Table<{ id: string; fingerprint: string; data: unknown }, string>;
  constructor() {
    super('arabic-reader-aramorph-files');
    this.version(1).stores({ files: 'name' });
    this.version(2).stores({ files: 'name', parsedTables: 'id' });
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
  // A custom dataset being cleared/replaced means whatever parsed-table
  // cache exists is for a dataset that's about to stop being active --
  // dropping it here (rather than leaving it to age out via fingerprint
  // mismatch) keeps the two caches from ever visibly disagreeing.
  await db.parsedTables.clear();
}

/** Previously-*parsed* tables (not just cached raw text) for whichever
 * dataset's source text hashes to `fingerprint` -- the whole point of this
 * cache is skipping `createDictTable`'s ~136k-line parse pass on every
 * app launch, which is otherwise unavoidable even for the bundled default
 * dataset (the raw-text cache above only ever holds a *custom* upload). */
export async function loadCachedParsedTables(fingerprint: string): Promise<unknown | null> {
  const row = await db.parsedTables.get('current');
  if (!row || row.fingerprint !== fingerprint) return null;
  return row.data;
}

export async function saveParsedTables(fingerprint: string, data: unknown): Promise<void> {
  await db.parsedTables.put({ id: 'current', fingerprint, data });
}

export { DICT_FILE_NAMES, type DictFileName } from './dictFileNames';
