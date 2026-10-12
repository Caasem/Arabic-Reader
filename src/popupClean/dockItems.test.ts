import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { dockItemsFor } from './dockItems';

const entry = (providerId: string, root: string | undefined, gloss = 'x'): DictionaryEntry => ({ providerId, providerName: providerId, headword: gloss, root, senses: [{ gloss }] });
const group = (providerId: string, entries: DictionaryEntry[], from = 0) => ({ providerId, providerName: providerId, entries: entries.map((e, i) => ({ entry: e, index: from + i })) });

describe('dockItemsFor', () => {
  it('makes one tab per root, at that root’s first entry, for any dictionary with several roots', () => {
    for (const id of ['alwasit', 'lane', 'hanswehr', 'aramorph']) {
      const items = dockItemsFor([group(id, [entry(id, 'كتب'), entry(id, 'كتب'), entry(id, 'كتاب'), entry(id, 'كتاب')], 3)]);
      expect(items.map((i) => [i.index, i.headword, i.group])).toEqual([[3, 'كتب', id], [5, 'كتاب', id]]);
    }
  });

  it('has no tabs for a dictionary under one root, or none', () => {
    expect(dockItemsFor([group('lane', [entry('lane', 'كتب'), entry('lane', 'كتب')])])).toEqual([]);
    expect(dockItemsFor([group('baranov', [entry('baranov', undefined), entry('baranov', undefined)])])).toEqual([]);
  });

  it('lists the tabs of every dictionary that qualifies, in order', () => {
    const items = dockItemsFor([group('a', [entry('a', 'ر١'), entry('a', 'ر٢')]), group('b', [entry('b', 'ر١')], 2), group('c', [entry('c', 'ر٣'), entry('c', 'ر٤')], 3)]);
    expect(items.map((i) => i.index)).toEqual([0, 1, 3, 4]);
  });
});
