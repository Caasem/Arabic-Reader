import { describe, expect, it } from 'vitest';
import { buildReverseIndex, reverseSearch } from './reverse';
import type { PersonalRow } from './parse';

const rows: PersonalRow[] = [
  ['بَيْتٌ', 'дом; жилище; بيت الله священный дом'],
  ['دَارٌ', 'дом, жилище; здание'],
  ['كِتَابٌ', 'книга; письмо'],
  ['مَكْتَبٌ', 'бюро; контора; مكتب الكتب книжный склад'],
  ['كَاتِبٌ', 'писатель, писарь'],
];

describe('reverseSearch', () => {
  it('puts a row whose sense opens with the word before one that only mentions it', () => {
    const r = buildReverseIndex([['أ', 'свет и тень; книга'], ['ب', 'это длинное описание, где есть и книга как слово'], ['ج', 'книга; том']]);
    expect(reverseSearch(r, 'книга').map((x) => x[0])[0]).toBe('ج');
  });
  const idx = buildReverseIndex(rows);
  it('finds a word in the sense before the same word in an example', () => {
    const r = buildReverseIndex([...rows, ['مَنْزِلٌ', 'жильё; هذا منزل дом хозяина']]);
    const found = reverseSearch(r, 'дом').map((x) => x[0]);
    expect(found.slice(0, 2).sort()).toEqual(['بَيْتٌ', 'دَارٌ'].sort());
    expect(found[2]).toBe('مَنْزِلٌ');
  });
  it('is case- and ё-insensitive, and matches longer words by prefix', () => {
    expect(reverseSearch(idx, 'КНИГА').map((x) => x[0])).toContain('كِتَابٌ');
    expect(reverseSearch(idx, 'писат').map((x) => x[0])).toEqual(['كَاتِبٌ']);
  });
  it('lets a long word match other endings through its stem', () => {
    expect(reverseSearch(idx, 'книгой').map((x) => x[0])).toContain('كِتَابٌ');
  });
  it('needs every word of a phrase', () => {
    expect(reverseSearch(idx, 'дом жилище').map((x) => x[0]).sort()).toEqual(['بَيْتٌ', 'دَارٌ'].sort());
    expect(reverseSearch(idx, 'дом книга')).toEqual([]);
  });
  it('returns nothing for non-Russian input', () => {
    expect(reverseSearch(idx, 'house')).toEqual([]);
  });
});
