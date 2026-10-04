import Dexie, { type Table } from 'dexie';
import type { PersonalRow } from './parse';

export interface StoredPersonalDictionary {
  /** Always 'current' -- one personal dictionary slot. */
  id: string;
  label: string;
  rows: PersonalRow[];
  importedAt: number;
}

/** The user's own dictionary file, kept only in this browser's IndexedDB. */
class PersonalDictionaryDB extends Dexie {
  dictionaries!: Table<StoredPersonalDictionary, string>;
  constructor() {
    super('arabic-reader-personal-dictionary');
    this.version(1).stores({ dictionaries: 'id' });
  }
}

const db = new PersonalDictionaryDB();

export const loadPersonalDictionary = () => db.dictionaries.get('current');
export const savePersonalDictionary = (label: string, rows: PersonalRow[]) =>
  db.dictionaries.put({ id: 'current', label, rows, importedAt: Date.now() });
export const clearPersonalDictionary = () => db.dictionaries.clear();
