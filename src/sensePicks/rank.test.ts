import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { senseKey } from './keys';
import { applyPicks, pickId } from './rank';

const entry = (providerId: string, headword: string, glosses: string[]): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword,
  senses: glosses.map((gloss) => ({ gloss })),
});
const key = (e: DictionaryEntry, i: number) => senseKey(e.providerId, e.headword, e.senses[i]);

describe('applyPicks', () => {
  const a = entry('aramorph', 'كَتَبَ', ['to write', 'to write down', 'to decree']);
  const b1 = entry('baranov', 'كَتَبَ', ['to compose', 'to write to']);
  const b2 = entry('baranov', 'كُتُب', ['books']);
  const all = [a, b1, b2];

  it('returns the same entries when there are no picks', () => {
    const out = applyPicks(all, new Map());
    expect(out.entries).toBe(all);
    expect(out.matched.size).toBe(0);
  });

  it('moves a picked meaning to the top of its entry and leaves the rest in order', () => {
    const out = applyPicks(all, new Map([['aramorph', key(a, 2)]]));
    expect(out.entries[0].senses.map((s) => s.gloss)).toEqual(['to decree', 'to write', 'to write down']);
    expect(out.matched.has(pickId('aramorph', key(a, 2)))).toBe(true);
  });

  it('puts the entry holding the pick first within its dictionary only', () => {
    const out = applyPicks(all, new Map([['baranov', key(b2, 0)]]));
    expect(out.entries.map((e) => e.headword)).toEqual(['كَتَبَ', 'كُتُب', 'كَتَبَ']);
    expect(out.entries.map((e) => e.providerId)).toEqual(['aramorph', 'baranov', 'baranov']);
  });

  it('never reorders dictionaries among themselves', () => {
    const out = applyPicks(all, new Map([['baranov', key(b2, 0)], ['aramorph', key(a, 1)]]));
    expect(out.entries.map((e) => e.providerId)).toEqual(['aramorph', 'baranov', 'baranov']);
  });

  it('does not change a meaning that is already first', () => {
    const out = applyPicks(all, new Map([['aramorph', key(a, 0)]]));
    expect(out.entries[0]).toBe(a);
    expect(out.matched.size).toBe(1);
  });

  it('ignores a pick that matches nothing, for example after a dictionary changed', () => {
    const out = applyPicks(all, new Map([['aramorph', 'zzzzzzzzzzzzzzzz']]));
    expect(out.entries.map((e) => e.senses[0].gloss)).toEqual(['to write', 'to compose', 'books']);
    expect(out.matched.size).toBe(0);
  });

  it('ignores a pick for a dictionary that is not in the result', () => {
    const out = applyPicks(all, new Map([['alsihah', key(a, 1)]]));
    expect(out.entries).toEqual(all);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(all);
    applyPicks(all, new Map([['aramorph', key(a, 2)]]));
    expect(JSON.stringify(all)).toBe(before);
  });
});
