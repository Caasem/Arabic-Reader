import { db } from './schema';

/** Which existing save action produced a row (docs/specs/crowd-sense-ranking.md, section 10.5). */
export type SensePickSource = 'entry' | 'selection' | 'edit';

/** One dictionary entry the reader saved, for one word in one book. Kept on this device. */
export interface SensePickRow {
  /** `${bookKey}|${lemmaKey}|${providerId}|${entryKey}`: one row per saved entry per word per book. */
  key: string;
  bookKey: string;
  lemmaKey: string;
  providerId: string;
  entryKey: string;
  /** Present only when a finer save (a selection or an edit) pinned down one meaning inside the entry. */
  senseKey?: string;
  source: SensePickSource;
  /** Readable labels for the saved-entries file (src/picksExport). Kept on this device only. */
  word?: string;
  headword?: string;
  verbForm?: string;
  updatedAt: number;
}

export type SensePickInput = Omit<SensePickRow, 'key' | 'updatedAt' | 'senseKey'> & { senseKey?: string | null };

const prefix = (bookKey: string, lemmaKey: string): string => `${bookKey}|${lemmaKey}|`;
const rowKey = (p: { bookKey: string; lemmaKey: string; providerId: string; entryKey: string }): string =>
  `${prefix(p.bookKey, p.lemmaKey)}${p.providerId}|${p.entryKey}`;

/** Every saved entry for every word of this book, for the Alt+P file. */
export async function getSensePicksForBook(bookKey: string): Promise<SensePickRow[]> {
  return db.sensePicks.where('bookKey').equals(bookKey).toArray();
}

/** Every entry saved for this word in this book. */
export async function getSensePicks(bookKey: string, lemmaKey: string): Promise<SensePickRow[]> {
  return db.sensePicks.where('key').startsWith(prefix(bookKey, lemmaKey)).toArray();
}

/** Saves an entry, replacing an earlier save of the same entry (for example when a finer save names a meaning). */
export async function setSensePick(pick: SensePickInput): Promise<void> {
  const { senseKey, ...rest } = pick;
  await db.sensePicks.put({ ...rest, ...(senseKey ? { senseKey } : {}), key: rowKey(pick), updatedAt: Date.now() });
}

export async function clearSensePick(pick: { bookKey: string; lemmaKey: string; providerId: string; entryKey: string }): Promise<void> {
  await db.sensePicks.delete(rowKey(pick));
}

export async function clearWordPicks(bookKey: string, lemmaKey: string): Promise<void> {
  await db.sensePicks.where('key').startsWith(prefix(bookKey, lemmaKey)).delete();
}
