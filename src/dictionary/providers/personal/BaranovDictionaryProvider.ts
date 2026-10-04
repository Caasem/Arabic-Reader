import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { buildPersonalIndex, type PersonalIndex } from './index';
import { matchRows, rowsToEntries } from './matchRows';
import { parseDictionaryText } from './parse';

/**
 * Optional Arabic-Russian dictionary from baranov-data/russian.txt (see
 * baranov-data/SOURCE-README.md for provenance). Off by default; its data is its
 * own lazily loaded chunk, fetched only the first time the dictionary is used.
 */
export class BaranovDictionaryProvider implements DictionaryProvider {
  id = 'baranov';
  name = 'Baranov (Arabic-Russian)';

  private index: Promise<PersonalIndex> | null = null;

  private getIndex(): Promise<PersonalIndex> {
    this.index ??= import('virtual:baranov-data').then((mod) =>
      buildPersonalIndex(parseDictionaryText('russian.txt', mod.default)),
    );
    return this.index;
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const idx = await this.getIndex();
    return rowsToEntries(await matchRows(idx, word), this.id, this.name);
  }
}

export const baranovProvider = new BaranovDictionaryProvider();
