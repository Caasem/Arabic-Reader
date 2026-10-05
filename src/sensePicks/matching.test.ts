import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { entryMatchingMeaning, senseContainingWords } from './matching';

const entry = (headword: string, senses: DictionaryEntry['senses'], providerId = 'baranov'): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword,
  senses,
});

describe('senseContainingWords', () => {
  const e = entry('كَتَبَ', [
    { gloss: 'to write; to write out', examples: [{ ar: 'كَتَبْتُ رِسَالَةً', gloss: 'I wrote a letter' }] },
    { gloss: 'to compose, to author' },
    { gloss: 'to ordain, to decree' },
  ]);

  it('finds the one meaning that holds every selected word', () => {
    expect(senseContainingWords(e, 'compose author')?.gloss).toBe('to compose, to author');
    expect(senseContainingWords(e, 'decree')?.gloss).toBe('to ordain, to decree');
  });
  it('looks inside examples too', () => {
    expect(senseContainingWords(e, 'wrote letter')?.gloss).toBe('to write; to write out');
  });
  it('does not need the words to be next to each other or punctuated the same way', () => {
    expect(senseContainingWords(e, 'to … author')?.gloss).toBe('to compose, to author');
  });
  it('gives null when the words fit no meaning, or several', () => {
    expect(senseContainingWords(e, 'banana')).toBeNull();
    expect(senseContainingWords(e, 'to')).toBeNull();
    expect(senseContainingWords(e, 'compose decree')).toBeNull();
  });
  it('gives null for an empty selection', () => {
    expect(senseContainingWords(e, '  ')).toBeNull();
  });
});

describe('entryMatchingMeaning', () => {
  const a = entry('كَتَبَ', [{ gloss: 'to write' }, { gloss: 'to write down, to note' }], 'aramorph');
  const b = entry('كَتَّبَ', [{ gloss: 'to make someone write' }], 'aramorph');

  it('matches a meaning that equals a sense', () => {
    const m = entryMatchingMeaning([a, b], 'To write down, to note');
    expect(m?.entry).toBe(a);
    expect(m?.sense?.gloss).toBe('to write down, to note');
  });
  it('matches a meaning the reader extended, and names the entry even when two meanings fit', () => {
    const m = entryMatchingMeaning([a, b], 'to write down, to note (in a diary)');
    expect(m?.entry).toBe(a);
    expect(m?.sense?.gloss).toBe('to write down, to note');
    // 'to write' is inside 'to write down, to note': the more specific meaning is the one named.
    expect(entryMatchingMeaning([a, b], 'to write down, to note and to write')?.sense?.gloss).toBe('to write down, to note');
    // Two equally specific meanings: the entry is named, the meaning is not.
    const tie = entry('x', [{ gloss: 'to read' }, { gloss: 'to note' }], 'aramorph');
    const both = entryMatchingMeaning([tie], 'to read and to note');
    expect(both?.entry).toBe(tie);
    expect(both?.sense).toBeNull();
  });
  it('gives null for text of the reader\'s own, or when two entries fit', () => {
    expect(entryMatchingMeaning([a, b], 'something else entirely')).toBeNull();
    const twin = entry('كَتَبَ', [{ gloss: 'to write' }], 'aramorph');
    expect(entryMatchingMeaning([a, twin], 'to write')).toBeNull();
  });
  it('ignores very short meanings that would match anything', () => {
    expect(entryMatchingMeaning([entry('x', [{ gloss: 'to' }])], 'to be')).toBeNull();
  });
});
