import { describe, expect, it } from 'vitest';
import { formatDefinition } from './formatDefinition';
import { keyTiers } from './keyTiers';

describe('formatDefinition', () => {
  it('writes out ~ as the unvocalized headword', () => {
    const [s] = formatDefinition('كَانَ', '~ اىّ من кто бы ни был');
    expect(s.gloss).toBe('كان اىّ من кто бы ни был');
  });
  it('keeps a space when ~ is stuck to the next Arabic word', () => {
    expect(formatDefinition('كَانَ', 'доп. ~لم يقع')[0].gloss).toBe('доп. كان لم يقع');
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

describe('keyTiers', () => {
  it('ranks the word first, then dictionary forms, then roots, without repeats', () => {
    const t = keyTiers('كَانَ', [{ lemma: 'كانَ', root: 'كون' }, { lemma: 'كان', root: 'كون' }]);
    expect(t[0]).toEqual(['كان']);
    expect(t[1]).toEqual([]);
    expect(t[2]).toContain('كون');
  });
});
