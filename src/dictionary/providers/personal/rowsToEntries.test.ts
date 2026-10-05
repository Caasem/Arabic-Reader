import { describe, expect, it } from 'vitest';
import { rowsToEntries } from './rowsToEntries';

describe('rowsToEntries', () => {
  it('marks a verb article with its form, imperfect vowel, lemma and the tapped word\'s root', () => {
    const [e] = rowsToEntries([['كَانَ', 'I у كَوْنٌ 1) быть']], 'baranov', 'Baranov', 'كون');
    expect(e).toMatchObject({ verbForm: 'I', imperfectVowel: 'u', lemma: 'كَانَ', root: 'كون' });
  });
  it('leaves nouns without verb fields', () => {
    const [e] = rowsToEntries([['بَيْتٌ', 'дом']], 'baranov', 'Baranov', 'بيت');
    expect(e.verbForm).toBeUndefined();
    expect(e.root).toBeUndefined();
  });
});
