import { describe, expect, it } from 'vitest';
import { hasSubEntryHeads, hasSubEntryIndex, matchedHead, unitHead } from './heads';
import { articleVariants, cliticVariants, containsRoot, subEntryKey } from './keys';

describe('subEntryKey', () => {
  it('drops diacritics, tatweel and punctuation and folds alef/hamza, ى and ة', () => {
    expect(subEntryKey('الشَّىْءِ')).toBe('الشيء');
    expect(subEntryKey('إِدَامٌ,')).toBe('ادام');
    expect(subEntryKey('وفاةٌ:')).toBe('وفاه');
    expect(subEntryKey('ٱلْكِتـــاب')).toBe('الكتاب');
    expect(subEntryKey('(١)')).toBe('');
  });
});

describe('articleVariants / cliticVariants', () => {
  it('takes the article off, after a conjunction or preposition too', () => {
    expect(articleVariants('الكتاب')).toEqual(['الكتاب', 'كتاب']);
    expect(articleVariants('بالقلم')).toEqual(['بالقلم', 'قلم']);
    expect(articleVariants('ال')).toEqual(['ال']);
  });

  it('guesses a one-letter clitic, keeping at least three letters', () => {
    expect(cliticVariants('وقيراط')).toEqual(['قيراط']);
    expect(cliticVariants('والكتاب')).toEqual(expect.arrayContaining(['الكتاب', 'كتاب']));
    expect(cliticVariants('ولد')).toEqual([]);
  });
});

describe('containsRoot', () => {
  it('finds the strong radicals in order, weak letters and hamza optional', () => {
    expect(containsRoot('ادام', 'أدم')).toBe(true);
    expect(containsRoot('قيراط', 'قرط')).toBe(true);
    expect(containsRoot('صيرفي', 'صرف')).toBe(true);
    expect(containsRoot('وفاه', 'وفى')).toBe(true);
    expect(containsRoot('رد', 'ردد')).toBe(true);
    expect(containsRoot('ارض', 'بصر')).toBe(false);
    expect(containsRoot('فرق', 'قرف')).toBe(false);
  });
});

describe('unitHead: Lane', () => {
  it('reads a noun headword', () => {
    expect(unitHead('lane', 'حَسَدٌ Envy; or the wishing …', 'حسد')).toEqual({ head: 'حَسَدٌ', keys: ['حسد'], looseKeys: [] });
  });

  it('reads a verb paragraph: the verb, its form, and the verb without its object as a loose key', () => {
    const head = unitHead('lane', 'حَسَدَهُ عَلَى الشَّىْءِ 1 and , (S, A, Msb, K,) aor.', 'حسد')!;
    expect(head.head).toBe('حَسَدَهُ عَلَى الشَّىْءِ');
    expect(head.keys).toEqual(['حسده']);
    expect(head.looseKeys).toEqual(['حسد']);
    expect(head.verbForm).toBe(1);
    expect(unitHead('lane', 'إِسْتَهْشَشَ 10 see 2, in two places.', 'هش')?.verbForm).toBe(10);
  });

  it('picks the word holding the root out of a phrase', () => {
    expect(unitHead('lane', 'أَرْضٌ بَصِرَةٌ Land in which are stones', 'بصر')?.keys).toEqual(['بصره']);
    expect(unitHead('lane', 'صَحِبْتُهُ فَأَحْسَدْتُهُ 4 I associated with him', 'حسد')?.keys).toEqual(['فاحسدته']);
  });

  it('stops at punctuation after the headword, and keeps the article-less key', () => {
    expect(unitHead('lane', 'أَفِقٌ : see أَفِيقٌ, in two places.', 'افق')?.keys).toEqual(['افق']);
    expect(unitHead('lane', 'الفِرْنَوْسُ : see الفَارِسُ.', 'فرس')?.keys).toEqual(['الفرنوس', 'فرنوس']);
  });

  it('has no form for a noun or a quadriliteral paragraph', () => {
    expect(unitHead('lane', 'مَحْسُودٌ Envied. (S, A, Msb.)', 'حسد')?.verbForm).toBeUndefined();
    expect(unitHead('lane', 'دَحْرَجَهُ Q. 1 He rolled it', 'دحرج')?.verbForm).toBeUndefined();
  });
});

describe('unitHead: Hans Wehr', () => {
  it('reads the word before the transliteration', () => {
    expect(unitHead('hanswehr', 'حسود pl. حسد ḥusud envious', 'حسد')).toEqual({ head: 'حسود', keys: ['حسود'], looseKeys: [] });
    expect(unitHead('hanswehr', 'تحاسد taḥāsud mutual envy', 'حسد')?.verbForm).toBeUndefined();
  });

  it('marks the verb paragraph, which holds every form', () => {
    expect(unitHead('hanswehr', 'كتب kataba u (katb) to write … II to make write', 'كتب')?.verbForm).toBe(0);
    expect(unitHead('hanswehr', 'داف (دوف) dāfa u (dauf) to mix, mingle', 'دوف')?.verbForm).toBe(0);
  });

  it('marks a pointer elsewhere as a cross-reference', () => {
    expect(unitHead('hanswehr', 'ارغن look up alphabetically', 'رغن')?.crossRef).toBe(true);
    expect(unitHead('hanswehr', 'ترجم, ترجمة look up alphabetically', 'رجم')?.crossRef).toBe(true);
  });
});

describe('unitHead: the Arabic-Arabic dictionaries', () => {
  it("reads Al-Wasīṭ's parenthesised lead, and nothing from a continuation", () => {
    expect(unitHead('alwasit', '(الإِدَامُ): ما يؤكل بالخبز', 'أدم')?.keys).toEqual(['الادام', 'ادام']);
    expect(unitHead('alwasit', 'و- السقاءَ ونحوه: خرزَه', 'كتب')).toBeNull();
  });

  it("reads Al-Ṣiḥāḥ's opening word", () => {
    expect(unitHead('alsihah', 'والوَفاةُ: الموتُ.', 'وفى')?.keys).toEqual(expect.arrayContaining(['وفاه']));
  });

  it("reads only Maqāyīs's opening (root)", () => {
    expect(unitHead('almaqayis', '(وَفَى) الْوَاوُ وَالْفَاءُ', 'وفى', 0)?.keys).toEqual(['وفي']);
    expect(unitHead('almaqayis', '(وَمِنْهُ) يُقَالُ', 'وفى', 3)).toBeNull();
  });

  it('knows which dictionaries it reads and which it indexes', () => {
    expect(['lane', 'hanswehr', 'alsihah', 'alwasit', 'almaqayis'].every(hasSubEntryHeads)).toBe(true);
    expect(hasSubEntryIndex('almaqayis')).toBe(false);
    expect(hasSubEntryHeads('aramorph')).toBe(false);
    expect(unitHead('aramorph', 'كتب')).toBeNull();
  });
});

describe('matchedHead', () => {
  it('splits a line into the headword run and the rest', () => {
    expect(matchedHead('lane', 'حَسَدٌ Envy.', 'حسد')).toEqual(['حَسَدٌ', ' Envy.']);
    expect(matchedHead('alsihah', 'والوَفاةُ: الموتُ.', 'وفى')).toBeNull();
  });
});
