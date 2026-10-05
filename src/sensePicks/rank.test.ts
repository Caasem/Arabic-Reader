import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { entryKey, senseKey } from './keys';
import { applyPicks, pickId, type WordPick } from './rank';

const entry = (providerId: string, headword: string, glosses: string[], extra: Partial<DictionaryEntry> = {}): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword,
  senses: glosses.map((gloss) => ({ gloss })),
  ...extra,
});
const saved = (e: DictionaryEntry, sense?: number): WordPick => ({
  providerId: e.providerId,
  entryKey: entryKey(e),
  senseKey: sense === undefined ? undefined : senseKey(e.providerId, e.headword, e.senses[sense]),
});

describe('applyPicks', () => {
  // As an unvocalised tap can return: Form II listed before Form I in each dictionary.
  const a2 = entry('aramorph', 'كَتَّبَ', ['to make write'], { root: 'كتب', verbForm: 'II' });
  const a1 = entry('aramorph', 'كَتَبَ', ['to decree', 'to write down', 'to write'], { root: 'كتب', verbForm: 'I' });
  const b2 = entry('baranov', 'كَتَّبَ', ['заставить писать'], { root: 'كتب', verbForm: 'II' });
  const b1 = entry('baranov', 'كَتَبَ', ['писать', 'сочинять'], { root: 'كتب', verbForm: 'I' });
  const all = [a2, a1, b2, b1];

  it('returns the same entries when nothing is saved', () => {
    const out = applyPicks(all, []);
    expect(out.entries).toBe(all);
    expect(out.matched.size).toBe(0);
  });

  it('puts a saved entry first within its dictionary only', () => {
    const out = applyPicks(all, [saved(a1)]);
    expect(out.entries.map((e) => e.verbForm)).toEqual(['I', 'II', 'II', 'I']);
    expect(out.entries.map((e) => e.providerId)).toEqual(['aramorph', 'aramorph', 'baranov', 'baranov']);
    expect(out.matched.has(pickId('aramorph', entryKey(a1)))).toBe(true);
  });

  it('never reorders dictionaries among themselves', () => {
    const out = applyPicks(all, [saved(b1), saved(a1)]);
    expect(out.entries.map((e) => e.providerId)).toEqual(['aramorph', 'aramorph', 'baranov', 'baranov']);
    expect(out.entries.map((e) => e.verbForm)).toEqual(['I', 'II', 'I', 'II']);
  });

  it('keeps several saved entries in their own order, ahead of the rest', () => {
    const c = entry('aramorph', 'كُتِبَ', ['it was written'], { root: 'كتب' });
    const list = [a2, c, a1];
    const out = applyPicks(list, [saved(a1), saved(c)]);
    expect(out.entries.map((e) => e.headword)).toEqual([c.headword, a1.headword, a2.headword]);
  });

  it('moves a meaning to the top of its entry only when a finer save named it', () => {
    const plain = applyPicks(all, [saved(a1)]);
    expect(plain.entries[0].senses.map((s) => s.gloss)).toEqual(['to decree', 'to write down', 'to write']);
    const fine = applyPicks(all, [saved(a1, 2)]);
    expect(fine.entries[0].senses.map((s) => s.gloss)).toEqual(['to write', 'to decree', 'to write down']);
  });

  it('ignores a meaning that no longer exists but still moves the entry', () => {
    const out = applyPicks(all, [{ ...saved(a1), senseKey: 'zzzzzzzzzzzzzzzz' }]);
    expect(out.entries[0].verbForm).toBe('I');
    expect(out.entries[0].senses.map((s) => s.gloss)).toEqual(['to decree', 'to write down', 'to write']);
  });

  it('ignores a pick that matches nothing, and one for a dictionary that is absent', () => {
    expect(applyPicks(all, [{ providerId: 'aramorph', entryKey: 'zzzzzzzzzzzzzzzz' }]).entries).toEqual(all);
    expect(applyPicks(all, [{ providerId: 'alsihah', entryKey: entryKey(a1) }]).entries).toEqual(all);
  });

  it('matches an entry by its own fields, not its position or its meanings', () => {
    const reshaped = entry('aramorph', 'كَتَبَ', ['a new wording'], { root: 'كتب', verbForm: 'I' });
    const out = applyPicks([a2, reshaped], [saved(a1)]);
    expect(out.entries[0].headword).toBe('كَتَبَ');
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(all);
    applyPicks(all, [saved(a1, 2)]);
    expect(JSON.stringify(all)).toBe(before);
  });
});
