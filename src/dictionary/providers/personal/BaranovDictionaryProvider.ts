import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { buildPersonalIndex, type PersonalIndex } from './index';
import { matchRows, rowsToEntries } from './matchRows';
import { parseDictionaryText, type PersonalRow } from './parse';
import { buildReverseIndex, reverseSearch, type ReverseIndex } from './reverse';

/**
 * Optional Arabic-Russian dictionary from baranov-data/russian.txt (see
 * baranov-data/SOURCE-README.md for provenance). Off by default; its data is its
 * own lazily loaded chunk, fetched only the first time the dictionary is used.
 */
export class BaranovDictionaryProvider implements DictionaryProvider {
  id = 'baranov';
  name = 'Baranov (Arabic-Russian)';

  private data: Promise<{ rows: PersonalRow[]; index: PersonalIndex }> | null = null;
  private reverse: ReverseIndex | null = null;

  private getData() {
    this.data ??= import('virtual:baranov-data').then((mod) => {
      const rows = parseDictionaryText('russian.txt', mod.default);
      return { rows, index: buildPersonalIndex(rows) };
    });
    return this.data;
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const { index } = await this.getData();
    return rowsToEntries(await matchRows(index, word), this.id, this.name);
  }

  async reverseSearch(query: string): Promise<DictionaryEntry[]> {
    const { rows } = await this.getData();
    this.reverse ??= buildReverseIndex(rows);
    return rowsToEntries(reverseSearch(this.reverse, query), this.id, this.name);
  }
}

export const baranovProvider = new BaranovDictionaryProvider();
