import { describe, expect, it } from 'vitest';
import { buildLookupKeys, weakLastRadicalVariants } from './lookupKeys';

describe('weakLastRadicalVariants', () => {
  it('spells a weak last radical every other way', () => {
    expect(weakLastRadicalVariants('قري').sort()).toEqual(['قرا', 'قرى', 'قرو'].sort());
    expect(weakLastRadicalVariants('دعو').sort()).toEqual(['دعا', 'دعي', 'دعى'].sort());
  });

  it('leaves roots with a strong last radical alone, hamza included', () => {
    expect(weakLastRadicalVariants('كتب')).toEqual([]);
    expect(weakLastRadicalVariants('قرأ')).toEqual([]);
  });

  it('never varies a root shorter than three letters', () => {
    expect(weakLastRadicalVariants('في')).toEqual([]);
  });
});

describe('buildLookupKeys', () => {
  it('finds the second root of اقتراها under Al-Wasit\'s own spelling', () => {
    // Real AraMorph analyses of اقتراها: two roots.
    const keys = buildLookupKeys('اقتراها', [
      { root: 'قتر', lemma: 'أَقْتَر' },
      { root: 'قري', lemma: 'ٱِقْتَرَى' },
    ]);
    expect(keys.has('قتر')).toBe(true);
    expect(keys.has('قرا')).toBe(true); // Al-Wasit headword "قرا|قرو"
    expect(keys.has('قرو')).toBe(true);
    expect(keys.has('قرأ')).toBe(false); // the unrelated root "to read"
  });

  it('keeps the word, roots and dictionary forms, diacritics stripped', () => {
    const keys = buildLookupKeys('كَتَبَ', [{ root: 'كتب', lemma: 'كَتَب' }]);
    expect([...keys].sort()).toEqual(['كتب']);
  });
});
