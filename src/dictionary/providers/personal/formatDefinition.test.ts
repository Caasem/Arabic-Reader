import { describe, expect, it } from 'vitest';
import { formatDefinition } from './formatDefinition';
import { keyTiers } from './keyTiers';

describe('formatDefinition', () => {
  it('writes out ~ as the unvocalized headword', () => {
    const [s] = formatDefinition('كَانَ', 'быть; ~ اىّ من кто бы ни был');
    expect(s.examples).toEqual([{ ar: 'كان اىّ من', gloss: 'кто бы ни был' }]);
  });
  it('keeps a space when ~ is stuck to the next Arabic word', () => {
    expect(formatDefinition('كَانَ', 'доп. ~لم يقع')[0].gloss).toBe('доп. كان لم يقع');
    expect(formatDefinition('كَانَ', 'быть; ~لم يقع как не было')[0].examples?.[0].ar).toBe('كان لم يقع');
  });
  it('reads the verb form and imperfect vowel, and splits numbered senses', () => {
    const senses = formatDefinition('كَانَ', 'I у كَوْنٌ 1) быть, существовать; 2) происходить;');
    expect(senses.map((s) => s.gloss)).toEqual(['быть, существовать', 'происходить']);
    expect(senses[0].pos).toBe('verb, form I, imperfect u');
    expect(senses[0].notes).toBe('كَوْنٌ');
  });
  it('keeps plain text as one sense and a Russian lead-in as its own sense', () => {
    expect(formatDefinition('بَيْتٌ', 'дом').map((s) => s.gloss)).toEqual(['дом']);
    expect(formatDefinition('س', 'частица будущего 1) а 2) б').map((s) => s.gloss)).toEqual(['частица будущего', 'а', 'б']);
  });
  it('does not mistake a Latin I inside the text for a verb form', () => {
    expect(formatDefinition('x', 'метка I тип')[0].pos).toBeUndefined();
  });
});

describe('examples', () => {
  it('splits Arabic phrases from their Russian gloss; Russian after an example continues it', () => {
    const [s] = formatDefinition('بيت', 'дом; بيت الله Кааба; священный дом; هذا بيتى это мой дом');
    expect(s.gloss).toBe('дом');
    expect(s.examples).toEqual([
      { ar: 'بيت الله', gloss: 'Кааба; священный дом' },
      { ar: 'هذا بيتى', gloss: 'это мой дом' },
    ]);
  });
  it('leaves Arabic-only segments alone (not examples)', () => {
    expect(formatDefinition('x', 'a house; بيت')[0].examples).toBeUndefined();
  });
});

describe('keyTiers', () => {
  it('ranks the word first, then dictionary forms, then roots, without repeats', () => {
    const t = keyTiers('كَانَ', [{ lemma: 'كانَ', root: 'كون' }, { lemma: 'كان', root: 'كون' }]);
    expect(t[0]).toEqual(['كان']);
    expect(t[1]).toEqual([]);
    expect(t[2]).toContain('كون');
  });
});
