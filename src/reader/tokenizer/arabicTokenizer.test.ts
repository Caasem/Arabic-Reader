import { describe, expect, it } from 'vitest';
import { foldAlefHamza, normalize, normalizeForSearch, tokenize } from './arabicTokenizer';

describe('tokenize', () => {
  it('separates Arabic word runs from other text and keeps offsets exact', () => {
    const text = 'قال: hello كتاب';
    const tokens = tokenize(text);
    expect(tokens.filter((t) => t.isArabic).map((t) => t.text)).toEqual(['قال', 'كتاب']);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.text);
  });

  it('splits Arabic-script punctuation off adjacent words', () => {
    const tokens = tokenize('كتاب، قلم؟');
    expect(tokens.filter((t) => t.isArabic).map((t) => t.text)).toEqual(['كتاب', 'قلم']);
    expect(tokens.find((t) => t.text === '،')?.isArabic).toBe(false);
    expect(tokens.find((t) => t.text === '؟')?.isArabic).toBe(false);
  });

  it('treats Arabic-Indic digits as non-word text', () => {
    const tokens = tokenize('صفحة ١٢٣ و۴۵');
    expect(tokens.filter((t) => t.isArabic).map((t) => t.text)).toEqual(['صفحة', 'و']);
    expect(tokens.find((t) => t.text === '١٢٣')?.isArabic).toBe(false);
    expect(tokens.find((t) => t.text === '۴۵')?.isArabic).toBe(false);
  });

  it('keeps diacritics attached to their word', () => {
    expect(tokenize('كِتَابٌ').map((t) => t.text)).toEqual(['كِتَابٌ']);
  });
});

describe('normalize', () => {
  it('strips diacritics and tatweel', () => {
    expect(normalize('كِتَابٌ')).toBe('كتاب');
    expect(normalize('كـتـاب')).toBe('كتاب');
  });
});

describe('normalizeForSearch', () => {
  it('folds alef variants, drops diacritics, and maps back to original offsets', () => {
    const { normalized, toOriginal } = normalizeForSearch('أَحمد');
    expect(normalized).toBe('احمد');
    expect(toOriginal).toEqual([0, 2, 3, 4]);
  });
});

describe('foldAlefHamza', () => {
  it('folds every alef-with-hamza/madda/wasla form to bare alef', () => {
    expect(foldAlefHamza('إسلام آمن أحمد ٱلله')).toBe('اسلام امن احمد الله');
  });
});
