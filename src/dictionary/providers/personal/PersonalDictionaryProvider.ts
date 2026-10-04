import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { matchRows, rowsToEntries } from './matchRows';
import { buildPersonalIndex, type PersonalIndex } from './index';
import { parseDictionaryText } from './parse';
import { clearPersonalDictionary, loadPersonalDictionary, savePersonalDictionary } from './store';

const DEFAULT_NAME = 'My dictionary';

/**
 * A dictionary the user loads from their own file (e.g. a Russian-Arabic
 * dictionary they own), for personal use. Nothing is bundled or uploaded; the
 * rows live in this browser's IndexedDB. Matching mirrors Al-Wasīṭ: the tapped
 * word plus AraMorph's roots and lemmas are tried as headwords.
 */
export class PersonalDictionaryProvider implements DictionaryProvider {
  id = 'personal';
  name = DEFAULT_NAME;

  private index: Promise<PersonalIndex | null> | null = null;
  private listeners = new Set<() => void>();
  private count = 0;

  onDataChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Promise<PersonalIndex | null> {
    if (!this.index) {
      this.index = loadPersonalDictionary().then((stored) => {
        if (!stored) return null;
        this.name = stored.label || DEFAULT_NAME;
        this.count = stored.rows.length;
        return buildPersonalIndex(stored.rows);
      });
    }
    return this.index;
  }

  /** Label and size of what's loaded, or null when nothing is. */
  async getInfo(): Promise<{ label: string; count: number } | null> {
    const idx = await this.load();
    return idx ? { label: this.name, count: this.count } : null;
  }

  /** Parses `file` and replaces the current personal dictionary. Returns the entry count. */
  async importFile(file: File, label?: string): Promise<number> {
    const rows = parseDictionaryText(file.name, await file.text());
    if (rows.length === 0) {
      throw new Error('No entries found. Expected "headword<TAB>definition" lines, or a .csv, .json or .dsl file.');
    }
    const name = label?.trim() || file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME;
    await savePersonalDictionary(name, rows);
    this.reset();
    return rows.length;
  }

  async clear(): Promise<void> {
    await clearPersonalDictionary();
    this.name = DEFAULT_NAME;
    this.count = 0;
    this.reset();
  }

  private reset(): void {
    this.index = null;
    this.listeners.forEach((l) => l());
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const idx = await this.load();
    if (!idx) return [];

    const matched = await matchRows(idx, word);
    return rowsToEntries(matched, this.id, this.name);
  }
}

export const personalDictionaryProvider = new PersonalDictionaryProvider();
