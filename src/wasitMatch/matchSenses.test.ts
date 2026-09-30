import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { findMatchedSenses, leadForm } from './matchSenses';

const entry: DictionaryEntry = {
  providerId: 'alwasit',
  providerName: 'Al-Wasit',
  headword: 'كتب',
  senses: [
    { gloss: '(كَتَبَ) الكتابَ -ُ كَتْبًا: خطَّهُ.' },
    { gloss: 'و- السقاءَ ونحوه: خرزَه بسَيرين.' },
    { gloss: '(أَكْتَبَهُ): علَّمه الكتابة.' },
    { gloss: '(كَاتَبَ) صديقَه: راسله.' },
  ],
};

describe('leadForm', () => {
  it('reads the parenthesised citation form, not continuation senses', () => {
    expect(leadForm('(كَتَبَ) الكتابَ')).toBe('كَتَبَ');
    expect(leadForm('و- السقاءَ: خرزَه')).toBeNull();
  });
});

describe('findMatchedSenses', () => {
  it('matches the tapped word ignoring diacritics', () => {
    expect([...findMatchedSenses(entry, 'كتب')]).toEqual([0]);
  });

  it('matches a lemma from morphology', () => {
    const matched = findMatchedSenses(entry, 'كاتبته', [{ surfaceForm: 'كاتبته', lemma: 'كَاتَبَ' }]);
    expect([...matched]).toEqual([3]);
  });

  it('folds alef/hamza variants', () => {
    expect([...findMatchedSenses(entry, 'اكتبه')]).toEqual([2]);
  });

  it('matches nothing for an unrelated word', () => {
    expect(findMatchedSenses(entry, 'بيت').size).toBe(0);
  });
});
