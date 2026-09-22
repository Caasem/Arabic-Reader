import { describe, expect, it } from 'vitest';
import { buildEntryTokenSenses, reconstructSelection } from './definitionTokens';
import type { DictionaryEntry } from '../../types';

const entry: DictionaryEntry = {
  providerId: 'alwasit',
  providerName: 'Al-Wasit',
  headword: 'x',
  senses: [{ gloss: 'a b c' }, { gloss: 'd e' }],
};

describe('definition token selection', () => {
  const { flat, bySense } = buildEntryTokenSenses(entry);

  it('builds one flat stream with per-sense groups sharing the same indices', () => {
    expect(flat.map((t) => t.text)).toEqual(['a', ' ', 'b', ' ', 'c', ' ', 'd', ' ', 'e']);
    expect(bySense[1].map((t) => t.globalIdx)).toEqual([6, 7, 8]);
  });

  it('keeps original spacing between adjacent selected words', () => {
    expect(reconstructSelection(flat, new Set([0, 2]))).toBe('a b');
  });

  it('collapses a gap over unselected words to one space', () => {
    expect(reconstructSelection(flat, new Set([0, 4]))).toBe('a c');
  });

  it('joins a selection that spans two senses', () => {
    expect(reconstructSelection(flat, new Set([4, 6]))).toBe('c d');
  });
});
