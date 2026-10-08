import { describe, expect, it } from 'vitest';
import { cleanWord, wordBounds } from './wordAtPoint';

describe('wordBounds', () => {
  const text = 'ذهب الولد إلى المدرسة';
  it('finds the Arabic word around an offset', () => {
    expect(wordBounds(text, 6)).toEqual([4, 9]); // inside الولد
    expect(text.slice(...wordBounds(text, 0)!)).toBe('ذهب');
  });
  it('takes the word just before when the offset is on its trailing edge', () => {
    expect(text.slice(...wordBounds(text, 3)!)).toBe('ذهب');
  });
  it('finds nothing on spaces, digits or Latin text', () => {
    expect(wordBounds('abc 123', 2)).toBeNull();
    expect(wordBounds('', 0)).toBeNull();
  });
  it('keeps vowel marks inside the word', () => {
    expect(wordBounds('كَتَبَ', 2)).toEqual([0, 6]);
  });
});

describe('cleanWord', () => {
  it('folds presentation forms to plain letters and drops tatweel', () => {
    expect(cleanWord('ﻛﺘـﺐ')).toBe('كتب');
  });
});
