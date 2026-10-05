import { describe, expect, it } from 'vitest';
import { buildEntryTokenSenses, buildExampleEntryTokens, reconstructSelection } from './definitionTokens';
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

describe('buildExampleEntryTokens', () => {
  const entry: DictionaryEntry = {
    providerId: 'baranov',
    providerName: 'Baranov',
    headword: 'كان',
    senses: [{ gloss: 'быть', examples: [{ ar: 'كان هنا', gloss: 'он был здесь' }] }, { gloss: 'происходить' }],
  };
  it('tokenizes sense text, then each example, in one stream with one index space', () => {
    const t = buildExampleEntryTokens(entry);
    expect(t.flat.map((x) => x.globalIdx)).toEqual(t.flat.map((_, i) => i));
    expect(t.senses[0].gloss.map((x) => x.text)).toEqual(['быть']);
    expect(t.senses[0].examples[0].ar.filter((x) => x.isWord).map((x) => x.text)).toEqual(['كان', 'هنا']);
    expect(t.senses[1].gloss[0].text).toBe('происходить');
  });
  it('rebuilds a selection that spans a sense and an example', () => {
    const t = buildExampleEntryTokens(entry);
    const idx = (text: string) => t.flat.findIndex((x) => x.text === text);
    expect(reconstructSelection(t.flat, new Set([idx('быть'), idx('هنا'), idx('он')]))).toBe('быть هنا он');
  });
});
