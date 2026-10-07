import { describe, expect, it } from 'vitest';
import { headwordWindow } from './headwords';

const rows = ['كبد', 'كبر', 'كبس', 'كتب', 'كتت', 'كتف|كتفة', 'كتل'].map((word, id) => ({ id, word }));
const byKey = new Map<string, { id: number; word: string }[]>();
for (const row of rows) for (const part of row.word.split('|')) byKey.set(part, [...(byKey.get(part) ?? []), row]);

describe('headwordWindow', () => {
  it('returns the headwords around a word in file order', () => {
    expect(headwordWindow(byKey, 'كتب', 2, 2)).toEqual({ words: ['كبر', 'كبس', 'كتب', 'كتت', 'كتف'], index: 2 });
  });

  it('clips at the ends and finds a variant spelling', () => {
    expect(headwordWindow(byKey, 'كبد', 3, 1)).toEqual({ words: ['كبد', 'كبر'], index: 0 });
    expect(headwordWindow(byKey, 'كتفة', 1, 5)).toEqual({ words: ['كتت', 'كتف', 'كتل'], index: 1 });
  });

  it('is null for a word that is not a headword', () => {
    expect(headwordWindow(byKey, 'قلم', 2, 2)).toBeNull();
  });
});
