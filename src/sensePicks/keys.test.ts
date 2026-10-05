import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bookKey, lemmaKey, normalizeArabic, normalizeText, senseKey } from './keys';
import { sha256Hex } from './sha256';

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches node crypto on Arabic text and on inputs that cross a block boundary', () => {
    for (const text of ['كَتَبَ|baranov|to write', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'ب'.repeat(100)]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('normalizing', () => {
  it('collapses whitespace, trims and lower-cases Latin, keeping vowel marks', () => {
    expect(normalizeText('  To   WRITE ')).toBe('to write');
    expect(normalizeText('كَتَبَ')).toBe('كَتَبَ');
  });
  it('strips vowel marks and tatweel for Arabic keys', () => {
    expect(normalizeArabic('كَتَبَ')).toBe('كتب');
    expect(normalizeArabic('كـتـب')).toBe('كتب');
  });
  it('treats composed and decomposed Unicode as the same text', () => {
    expect(normalizeText('é')).toBe(normalizeText('é'));
  });
});

describe('senseKey', () => {
  const write = { gloss: 'to write' };

  it('is stable and short', () => {
    const key = senseKey('baranov', 'كَتَبَ', write);
    expect(key).toBe(senseKey('baranov', 'كَتَبَ', write));
    expect(key).toMatch(/^[a-z2-7]{16}$/);
  });
  it('ignores vowel marks on the headword and case or spacing in the meaning', () => {
    expect(senseKey('baranov', 'كتب', { gloss: ' To  Write' })).toBe(senseKey('baranov', 'كَتَبَ', write));
  });
  it('differs by dictionary, so a key only means something inside one', () => {
    expect(senseKey('baranov', 'كَتَبَ', write)).not.toBe(senseKey('aramorph', 'كَتَبَ', write));
  });
  it('differs by meaning', () => {
    expect(senseKey('baranov', 'كَتَبَ', write)).not.toBe(senseKey('baranov', 'كَتَبَ', { gloss: 'to decree' }));
  });
  it('does not depend on where the meaning sits in the entry', () => {
    const entry = [{ gloss: 'to decree' }, write];
    const reordered = [...entry].reverse();
    expect(entry.map((s) => senseKey('baranov', 'كَتَبَ', s)).sort()).toEqual(reordered.map((s) => senseKey('baranov', 'كَتَبَ', s)).sort());
  });
  it('uses the examples when a meaning is only examples', () => {
    const onlyExamples = { gloss: '', examples: [{ ar: 'كَتَبَ رِسَالَةً', gloss: 'he wrote a letter' }] };
    expect(senseKey('baranov', 'كَتَبَ', onlyExamples)).not.toBe(senseKey('baranov', 'كَتَبَ', { gloss: '' }));
  });
  it('gives identical meanings the same key', () => {
    expect(senseKey('baranov', 'كَتَبَ', { gloss: 'to write', pos: 'verb' })).toBe(senseKey('baranov', 'كَتَبَ', { gloss: 'to write' }));
  });
});

describe('lemmaKey and bookKey', () => {
  it('lemmaKey ignores vowel marks and depends on part of speech', () => {
    expect(lemmaKey('كَتَبَ')).toBe(lemmaKey('كتب'));
    expect(lemmaKey('كتب', 'verb')).not.toBe(lemmaKey('كتب', 'noun'));
  });
  it('bookKey identifies a work by title, author and language, not by file', () => {
    const a = bookKey({ title: 'الأيام', author: 'طه حسين', language: 'ar' });
    expect(bookKey({ title: ' الأيام ', author: 'طه حسين', language: 'AR' })).toBe(a);
    expect(bookKey({ title: 'الأيام', author: 'غيره', language: 'ar' })).not.toBe(a);
    expect(a).toMatch(/^[a-z2-7]{20}$/);
  });
  it('bookKey works without an author or language', () => {
    expect(bookKey({ title: 'كتاب' })).toBe(bookKey({ title: 'كتاب', author: '', language: '' }));
  });
});
