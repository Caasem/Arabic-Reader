import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../types';
import { leadForm, openingKeys } from './heads';
import { findMatchedSenses, isFunctionWord, matchTier, wantedKeys } from './match';

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

describe('findMatchedSenses: Al-Wasīṭ', () => {
  it('matches the tapped word ignoring diacritics', () => {
    expect([...findMatchedSenses(entry, 'كتب')]).toEqual([0]);
  });

  it('matches a lemma from morphology', () => {
    const matched = findMatchedSenses(entry, 'كاتبته', [{ lemma: 'كَاتَبَ' }]);
    expect([...matched]).toEqual([3]);
  });

  it('folds alef/hamza variants', () => {
    expect([...findMatchedSenses(entry, 'اكتبه')]).toEqual([2]);
  });

  it('matches nothing for an unrelated word', () => {
    expect(findMatchedSenses(entry, 'بيت').size).toBe(0);
  });

  it('falls back to a verb lead without its object pronoun', () => {
    // (أَكْتَبَهُ) without its ه is أكتب.
    expect([...findMatchedSenses(entry, 'أكتب', [{ lemma: 'أَكْتَب', form: 'IV' }])]).toEqual([2]);
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
    expect(openingKeys('والوَفاةُ: الموتُ.')).toEqual(expect.arrayContaining(['والوفاه', 'الوفاه', 'وفاه']));
    expect(openingKeys('واسْتَوْفى حقّه')).toEqual(expect.arrayContaining(['استوفي']));
    expect(openingKeys('')).toEqual([]);
  });

  it('marks the line whose headword is the looked-up form, via its lemma', () => {
    const matched = findMatchedSenses(sihah, 'استوفى', [{ lemma: 'ٱِسْتَوْفَى' }]);
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
      senses: [{ gloss: '(وَفَى) الْوَاوُ وَالْفَاءُ وَالْحَرْفُ الْمُعْتَلُّ: كَلِمَةٌ تَدُلُّ عَلَى إِكْمَالٍ.' }, { gloss: '(وَمِنْهُ) يُقَالُ لِلْمَيِّتِ.' }],
    };
    expect([...findMatchedSenses(maqayis, 'وفى')]).toEqual([0]);
  });
});

/** Lane's حسد, abridged. */
const lane: DictionaryEntry = {
  providerId: 'lane',
  providerName: 'Lane',
  headword: 'حسد',
  root: 'حسد',
  senses: [
    { gloss: 'حَسَدَهُ عَلَى الشَّىْءِ 1 and , (S, A, Msb, K,) aor. ﹹ and ﹻ, …' },
    { gloss: 'حَسَّدَ 2 see 1.' },
    { gloss: 'صَحِبْتُهُ فَأَحْسَدْتُهُ 4 I associated with him and found him to be envious. (A.)' },
    { gloss: 'تحاسدوا 6 They envied (حَسَدُوا) one another. (S, A, * K.)' },
    { gloss: 'حَسَدٌ Envy; or the wishing that a blessing … may depart from its possessor.' },
    { gloss: 'حَسُودٌ Envious: (Msb, K:) used also as a fem. epithet without ة: (TA:) pl. حُسُدٌ. (K.)' },
    { gloss: 'حَاسِدٌ Envying: (S, Msb, K:) pl. حَسَدَةٌ' },
    { gloss: 'المَحْسَدَةُ مَفْسَدَةٌ [That which is a cause of envy is a cause of corruption, or evil]. (A.)' },
  ],
};

describe("Lane's Lexicon", () => {
  it("lands a verb on its form's paragraph, even one opening with an example", () => {
    expect([...findMatchedSenses(lane, 'حسدته', [{ lemma: 'حَسَد', root: 'حسد', form: 'I' }])]).toEqual([0]);
    expect([...findMatchedSenses(lane, 'أحسدته', [{ lemma: 'أَحْسَد', root: 'حسد', form: 'IV' }])]).toEqual([2]);
    expect([...findMatchedSenses(lane, 'تحاسدوا', [{ lemma: 'تَحاسَد', root: 'حسد', form: 'VI' }])]).toEqual([3]);
  });

  it('lands a noun on its own paragraph, not the verb sharing its letters', () => {
    expect([...findMatchedSenses(lane, 'الحسود', [{ lemma: 'حَسُود', root: 'حسد' }])]).toEqual([5]);
    expect([...findMatchedSenses(lane, 'حسد', [{ lemma: 'حَسَد', root: 'حسد' }])]).toEqual([4]);
  });

  it('reads a headword with the article', () => {
    expect([...findMatchedSenses(lane, 'محسدة', [{ lemma: 'مَحْسَدَة', root: 'حسد' }])]).toEqual([7]);
  });

  it("does not take a verb form from another root's verb", () => {
    expect(findMatchedSenses(lane, 'كتبته', [{ lemma: 'كَتَب', root: 'كتب', form: 'I' }]).size).toBe(0);
  });

  it('ignores readings that clash with the written vowels when another reading fits', () => {
    const analyses = [
      { lemma: 'حَسَد', root: 'حسد', form: 'I', vowelClash: true },
      { lemma: 'حَسَد', root: 'حسد' },
    ];
    expect([...findMatchedSenses(lane, 'حَسَدٌ', analyses)]).toEqual([4]);
  });
});

describe('Hans Wehr', () => {
  const hw: DictionaryEntry = {
    providerId: 'hanswehr',
    providerName: 'Hans Wehr',
    headword: 'حسد',
    root: 'حسد',
    senses: [
      { gloss: 'حسد ḥasada u (ḥasad) to envy, grudge (ه s.o., على or هـ s.th.)' },
      { gloss: 'حسد ḥasad envy' },
      { gloss: 'حسود pl. حسد ḥusud envious' },
      { gloss: 'تحاسد taḥāsud mutual envy' },
    ],
  };

  it('lands every verb form on the verb paragraph', () => {
    expect([...findMatchedSenses(hw, 'تحاسدوا', [{ lemma: 'تَحاسَد', root: 'حسد', form: 'VI' }])]).toEqual([0]);
  });

  it('lands nouns on their own line', () => {
    expect([...findMatchedSenses(hw, 'حسود', [{ lemma: 'حَسُود', root: 'حسد' }])]).toEqual([2]);
    expect([...findMatchedSenses(hw, 'التحاسد', [{ lemma: 'تَحاسُد', root: 'حسد' }])]).toEqual([3]);
  });
});

describe('matchTier / wantedKeys', () => {
  it('strips the article by hand only for a word AraMorph does not know', () => {
    expect(wantedKeys('البير').exact.has('بير')).toBe(true);
    expect(wantedKeys('ألبير', [{ lemma: 'أَلْبِير' }]).exact.has('بير')).toBe(false);
  });

  it('ranks a loose clitic guess below an exact key', () => {
    const head = { head: '', keys: ['قيراط'], looseKeys: [] };
    expect(matchTier(head, wantedKeys('قيراط'), 'lane', 'قرط')).toBe(2);
    expect(matchTier(head, wantedKeys('وقيراط'), 'lane', 'قرط')).toBe(1);
    expect(matchTier(null, wantedKeys('قيراط'), 'lane', 'قرط')).toBe(0);
  });
});

describe('isFunctionWord', () => {
  it("reads the stem's tag after any prefixes", () => {
    expect(isFunctionWord({ pos: 'li>an~a/CONJ' })).toBe(true);
    expect(isFunctionWord({ pos: 'wa/CONJ+, li>an~a/CONJ' })).toBe(true);
    expect(isFunctionWord({ pos: 'fiy/PREP, +hi/PRON_3MS' })).toBe(true);
    expect(isFunctionWord({ pos: 'Al~a*iy/REL_PRON' })).toBe(true);
    expect(isFunctionWord({ pos: 'laso/NEG_PART+ta/PVSUFF_SUBJ:2MS' })).toBe(true);
  });

  it('leaves nouns, verbs and untagged stems alone', () => {
    expect(isFunctionWord({ pos: 'wa/CONJ+' })).toBe(false);
    expect(isFunctionWord({ pos: 'Al/DET+, nafiy~/ADJ' })).toBe(false);
    expect(isFunctionWord({ pos: '>ab/NOUN+iy/POSS_PRON_1S' })).toBe(false);
    expect(isFunctionWord({ pos: '+tu/PVSUFF_SUBJ:1S+hu/PVSUFF_DO:3MS' })).toBe(false);
    expect(isFunctionWord({})).toBe(false);
  });
});

describe('telling homographs apart by their vowels', () => {
  const kitab: DictionaryEntry = {
    providerId: 'lane',
    providerName: 'Lane',
    headword: 'كتب',
    root: 'كتب',
    senses: [
      { gloss: 'كِتَابٌ [inf. n. of 1] A writing; a book.' },
      { gloss: 'كُتَّابٌ , see مَكْتَبٌ' },
      { gloss: 'كَاتِبٌ A writer.' },
      { gloss: 'كِتَابٌ (same as عَقْدٌ) The ceremony.' },
    ],
  };

  it("keeps to the best reading's own headword when several readings match", () => {
    const readings = [{ lemma: 'كِتاب', root: 'كتب' }, { lemma: 'كُتّاب', root: 'كتب' }, { lemma: 'كاتِب', root: 'كتب' }];
    expect([...findMatchedSenses(kitab, 'كتاب', readings)]).toEqual([0, 3]);
    expect([...findMatchedSenses(kitab, 'كُتّاب', readings.slice(1))]).toEqual([1]);
  });

  it('keeps every match when the vowels say nothing', () => {
    expect([...findMatchedSenses(kitab, 'كتاب', [{ lemma: 'كتاب' }])]).toEqual([0, 1, 3]);
  });
});

describe('a lemma match the vowels contradict', () => {
  it('is dropped unless the headword is spelled as tapped', () => {
    const wasit: DictionaryEntry = {
      providerId: 'alwasit',
      providerName: 'Al-Wasit',
      headword: 'علم',
      senses: [{ gloss: '(العَالَمُ): الخلق كله.' }],
    };
    expect(findMatchedSenses(wasit, 'العلماء', [{ lemma: 'عالِم', root: 'علم' }]).size).toBe(0);
    expect([...findMatchedSenses(wasit, 'عالم', [{ lemma: 'عالِم', root: 'علم' }])]).toEqual([0]);
  });
});
