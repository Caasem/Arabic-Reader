import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../types';
import { findMatchedSenses, leadForm, openingKeys } from './matchSenses';

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

describe('Al-Sihah: lines that open with the headword', () => {
  const sihah: DictionaryEntry = {
    providerId: 'alsihah',
    providerName: 'Al-Sihah',
    headword: 'وفى',
    senses: [
      { gloss: 'الوَفاءُ: ضدُّ الغدر. يقال: وَفى بعهده وأَوْفى بمعنًى.' },
      { gloss: 'ووَفى الشئ وفيا، على فعول، أي تم وكثر.' },
      { gloss: 'وأوفى على الشئ، أي أشرف.' },
      { gloss: 'واسْتَوْفى حقّه وتَوَفَّاهُ بمعنًى.' },
      { gloss: 'والوَفاةُ: الموتُ.' },
      { gloss: '(١) حميد الارقط.' },
    ],
  };

  it('reads the first word without the conjunction or the article', () => {
    expect(openingKeys('والوَفاةُ: الموتُ.')).toEqual(expect.arrayContaining(['والوفاة', 'الوفاة', 'وفاة']));
    expect(openingKeys('واسْتَوْفى حقّه')).toEqual(expect.arrayContaining(['استوفى']));
    expect(openingKeys('')).toEqual([]);
  });

  it('marks the line whose headword is the looked-up form, via its lemma', () => {
    const matched = findMatchedSenses(sihah, 'استوفى', [{ surfaceForm: 'استوفى', lemma: 'ٱِسْتَوْفَى' }]);
    expect([...matched]).toEqual([3]);
  });

  it('matches a noun opening with the article', () => {
    expect([...findMatchedSenses(sihah, 'وفاة')]).toEqual([4]);
  });

  it('does not match a word that only occurs inside a line', () => {
    expect(findMatchedSenses(sihah, 'الغدر').size).toBe(0);
    expect(findMatchedSenses(sihah, 'بعهده').size).toBe(0);
  });

  it('leaves the numbered editorial notes unmatched', () => {
    expect(findMatchedSenses(sihah, 'حميد').size).toBe(0);
  });
});

describe('Maqayis: the opening (root) paragraph', () => {
  it('matches the root the article opens with', () => {
    const maqayis: DictionaryEntry = {
      providerId: 'almaqayis',
      providerName: 'Maqayis',
      headword: 'وفى',
      senses: [{ gloss: '(وَفَى) الْوَاوُ وَالْفَاءُ وَالْحَرْفُ الْمُعْتَلُّ: كَلِمَةٌ تَدُلُّ عَلَى إِكْمَالٍ.' }, { gloss: 'وَمِنْهُ يُقَالُ لِلْمَيِّتِ.' }],
    };
    expect([...findMatchedSenses(maqayis, 'وفى')]).toEqual([0]);
  });
});
