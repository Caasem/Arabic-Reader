// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { refineRead } from './refine';
import { repairCandidates, repairVariants } from './repair';

const REAL = new Set(['المدرسة', 'المدرسي', 'الولد', 'في', 'كتاب', 'قرأ', 'الباكر']);
const known = async (words: string[]) => new Set(words.filter((w) => REAL.has(w)));

describe('repairVariants', () => {
  it('swaps confusable letters, puts dropped letters back and removes strays', () => {
    const words = repairVariants('المدرسه').map((v) => v.word);
    expect(words).toContain('المدرسة');
    expect(repairVariants('ف').map((v) => v.word)).toContain('في');
    expect(repairVariants('كتتاب').map((v) => v.word)).toContain('كتاب');
    expect(repairVariants('كتب').map((v) => v.word)).toContain('كتاب');
  });
  it('ignores vowel marks and never returns the read itself', () => {
    const words = repairVariants('الْمَدْرَسَه').map((v) => v.word);
    expect(words).toContain('المدرسة');
    expect(words).not.toContain('المدرسه');
  });
});

describe('repairCandidates', () => {
  it('keeps only dictionary words, likeliest first, and says why', async () => {
    const found = await repairCandidates('المدرسه', known);
    expect(found[0]).toMatchObject({ word: 'المدرسة', why: expect.stringContaining('ه → ة') });
    expect(found.length).toBeLessThanOrEqual(3);
  });
  it('prefers the commoner word when changes are equal', async () => {
    const ranks = async () => new Map([['المدرسي', 50000], ['المدرسة', 300]]);
    const found = await repairCandidates('المدرسه', known, ranks);
    expect(found[0].word).toBe('المدرسة');
    expect(found[0].why).toContain('common word');
  });
  it('returns nothing when no variant is a word', async () => {
    expect(await repairCandidates('ظظظظ', known)).toEqual([]);
  });
});

describe('refineRead', () => {
  it('keeps a first read the dictionary knows, without trying anything else', async () => {
    let ran = false;
    const out = await refineRead('الولد', [{ label: 'x', run: async () => ((ran = true), null) }], known);
    expect(out).toMatchObject({ word: 'الولد', suspect: false, via: 'first read' });
    expect(ran).toBe(false);
  });
  it('takes the first later attempt that gives a real word', async () => {
    const out = await refineRead(
      'المدرسه',
      [
        { label: 'a closer look', run: async () => 'المدرسه' },
        { label: 'a closer look', run: async () => 'المدرسة' },
        { label: 'Claude', run: async () => { throw new Error('should not run'); } },
      ],
      known
    );
    expect(out).toMatchObject({ word: 'المدرسة', suspect: false, via: 'a closer look' });
    expect(out.reads).toEqual(['المدرسه', 'المدرسة']);
  });
  it('marks the word suspect and offers corrections when nothing is a word', async () => {
    const out = await refineRead('المدرسه', [{ label: 'a closer look', run: async () => null }, { label: 'a closer look', run: async () => { throw new Error('boom'); } }], known);
    expect(out.suspect).toBe(true);
    expect(out.word).toBe('المدرسه');
    expect(out.candidates[0].word).toBe('المدرسة');
  });
  it('does not ask the dictionary about junk reads', async () => {
    const asked: string[][] = [];
    const out = await refineRead('1', [], async (w) => (asked.push(w), new Set()));
    expect(out.suspect).toBe(true);
    expect(asked).toEqual([]);
  });
});
