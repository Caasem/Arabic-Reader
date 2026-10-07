import Dexie, { type Table } from 'dexie';
import { getBlobStore } from '../../../blobStore';
import type { PersonalRow } from './parse';

export interface StoredPersonalDictionary {
  /** Always 'current' -- one personal dictionary slot. */
  id: string;
  label: string;
  rows: PersonalRow[];
  importedAt: number;
}

/**
 * What the slot holds now: the label and a reference to the parsed rows, which
 * live in the BlobStore (namespace `dictionary`, owner `personal`) as one JSON
 * file. A slot written before M1d still carries `rows` itself; it is moved on
 * first load.
 */
interface SlotRow {
  id: string;
  label: string;
  importedAt: number;
  fileHash?: string;
  /** Legacy: the rows stored inline. */
  rows?: PersonalRow[];
}

/** The user's own dictionary file, kept only on this device. */
class PersonalDictionaryDB extends Dexie {
  dictionaries!: Table<SlotRow, string>;
  constructor() {
    super('arabic-reader-personal-dictionary');
    this.version(1).stores({ dictionaries: 'id' });
  }
}

const db = new PersonalDictionaryDB();

const NS = 'dictionary';
const OWNER = 'personal';
const blobs = getBlobStore;

async function readRows(hash: string): Promise<PersonalRow[] | undefined> {
  const file = await blobs().get(hash);
  if (!file) return undefined;
  const rows: unknown = JSON.parse(await file.text());
  return Array.isArray(rows) ? (rows as PersonalRow[]) : undefined;
}

async function writeRows(rows: PersonalRow[]): Promise<string> {
  const file = new Blob([JSON.stringify(rows)], { type: 'application/json' });
  return (await blobs().put(file, { ns: NS, owner: OWNER, type: file.type })).hash;
}

export async function loadPersonalDictionary(): Promise<StoredPersonalDictionary | undefined> {
  const slot = await db.dictionaries.get('current');
  if (!slot) return undefined;
  const { label, importedAt } = slot;
  if (slot.fileHash) {
    const rows = await readRows(slot.fileHash).catch(() => undefined);
    // Bytes gone (cleared outside the app): same as no dictionary.
    return rows ? { id: 'current', label, rows, importedAt } : undefined;
  }
  const rows = slot.rows ?? [];
  try {
    // Bytes first, then the one write that swaps the rows for their reference: a kill in between loses nothing.
    const hash = await writeRows(rows);
    if (!(await blobs().has(hash))) throw new Error('The stored copy could not be confirmed.');
    await db.dictionaries.put({ id: 'current', label, importedAt, fileHash: hash });
  } catch (error) {
    console.error('The personal dictionary could not be moved to the BlobStore; it keeps working from where it was.', error);
  }
  return { id: 'current', label, rows, importedAt };
}

export async function savePersonalDictionary(label: string, rows: PersonalRow[]): Promise<void> {
  const previous = (await db.dictionaries.get('current'))?.fileHash;
  const hash = await writeRows(rows);
  try {
    await db.dictionaries.put({ id: 'current', label, importedAt: Date.now(), fileHash: hash });
  } catch (error) {
    if (previous !== hash) await blobs().unpin(hash, NS, OWNER).catch(() => undefined);
    throw error;
  }
  // One owner, one file: a replaced dictionary's rows are released (unless the new rows are identical).
  if (previous && previous !== hash) await blobs().unpin(previous, NS, OWNER);
}

export async function clearPersonalDictionary(): Promise<void> {
  const hash = (await db.dictionaries.get('current'))?.fileHash;
  await db.dictionaries.clear();
  if (hash) await blobs().unpin(hash, NS, OWNER);
}
