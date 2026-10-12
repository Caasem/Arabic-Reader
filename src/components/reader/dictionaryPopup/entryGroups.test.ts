import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../../types';
import { groupEntriesByProvider } from './entryGroups';

const e = (providerId: string, headword = 'x'): DictionaryEntry => ({
  providerId,
  providerName: providerId.toUpperCase(),
  headword,
  senses: [{ gloss: 'g' }],
});

describe('groupEntriesByProvider', () => {
  it('returns no groups for no entries', () => {
    expect(groupEntriesByProvider([])).toEqual([]);
  });

  it('folds consecutive entries of one provider into a group, keeping each flat index', () => {
    const a = e('a', '1');
    const b = e('a', '2');
    const groups = groupEntriesByProvider([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].providerId).toBe('a');
    expect(groups[0].providerName).toBe('A');
    expect(groups[0].entries).toEqual([
      { entry: a, index: 0 },
      { entry: b, index: 1 },
    ]);
  });

  it('starts a new group whenever the provider changes, in order', () => {
    const groups = groupEntriesByProvider([e('a'), e('b'), e('b'), e('c')]);
    expect(groups.map((g) => [g.providerId, g.entries.map((x) => x.index)])).toEqual([
      ['a', [0]],
      ['b', [1, 2]],
      ['c', [3]],
    ]);
  });

  it('does not merge a provider that returns after another one', () => {
    const groups = groupEntriesByProvider([e('a'), e('b'), e('a')]);
    expect(groups.map((g) => g.providerId)).toEqual(['a', 'b', 'a']);
    expect(groups[2].entries[0].index).toBe(2);
  });
});
