import { describe, expect, it } from 'vitest';
import { vowelScore } from './vowels';

describe('vowelScore', () => {
  it('0 when identical, 1 when only the ending differs, 2 otherwise', () => {
    expect(vowelScore('كَتَبَ', 'كَتَبَ')).toBe(0);
    expect(vowelScore('كَتَبَ', 'كَتَبٌ')).toBe(1);
    expect(vowelScore('كَتَبَ', 'كُتُبٌ')).toBe(2);
  });
  it('2 when the tapped word has no vowels', () => {
    expect(vowelScore('كتب', 'كَتَبَ')).toBe(2);
  });
});
