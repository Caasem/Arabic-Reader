import { describe, expect, it } from 'vitest';
import { ITALIC_CLOSE, ITALIC_OPEN } from '../../senseFormat/laneItalics';
import { findMatchedEntries, findMatchedSenses } from '../../subEntries/match';
import { articleEntries, opensNewWord, romanForm, wasitSenses } from './articleEntries';

const provider = (id: string) => ({ id, name: id });
const row = (word: string, ...units: string[]) => ({ id: 7, word, meanings: units.join('<br>') });

describe('articleEntries: Lane', () => {
  const entries = articleEntries(
    row('حسد', 'حَسَدٌ Envy; the wishing.', `حَسَدَهُ عَلَى الشَّىْءِ 1 , aor. ${ITALIC_OPEN}he envied${ITALIC_CLOSE}`, 'تَحَاسَدُوا 6 They envied one another.', 'See also حسد.'),
    provider('lane'),
  );

  it('makes one entry per line, in article order, each keeping the root and the article', () => {
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.senses[0].gloss.split(' ')[0])).toEqual(['حَسَدٌ', 'حَسَدَهُ', 'تَحَاسَدُوا', 'See']);
    expect(entries.every((e) => e.root === 'حسد' && e.articleKey === '7' && e.language === 'en' && e.senses.length === 1)).toBe(true);
  });

  it("reads each headword from the line and says how much of the line it is", () => {
    expect(entries[0].headword).toBe('حَسَدٌ');
    expect(entries[0].headLength).toBe('حَسَدٌ'.length);
    expect(entries[1].headword).toBe('حَسَدَهُ عَلَى الشَّىْءِ');
    expect(entries[3].headword).toBe('حسد');
  });

  it("keeps Lane's verb form number as the Roman numeral and Lane's italics as ranges", () => {
    expect(entries.map((e) => e.verbForm)).toEqual([undefined, 'I', 'VI', undefined]);
    expect(entries[1].senses[0].italics).toEqual([[entries[1].senses[0].gloss.indexOf('he envied'), entries[1].senses[0].gloss.length]]);
  });

  it('marks the same lines the article marked before it was cut', () => {
    const analyses = [{ lemma: 'تَحاسَد', root: 'حسد', form: 'VI' }];
    const merged = { providerId: 'lane', providerName: 'lane', headword: 'حسد', root: 'حسد', senses: entries.map((e) => e.senses[0]) };
    expect([...findMatchedEntries(entries, 'تحاسدوا', analyses).keys()]).toEqual([...findMatchedSenses(merged, 'تحاسدوا', analyses)]);
    expect([...findMatchedEntries(entries, 'حسد', [{ lemma: 'حَسَد', root: 'حسد' }]).keys()]).toEqual([...findMatchedSenses(merged, 'حسد', [{ lemma: 'حَسَد', root: 'حسد' }])]);
  });
});

describe('articleEntries: Hans Wehr', () => {
  const entries = articleEntries(row('حسد', 'حسد ḥasada u (ḥasad) to envy', 'VI to envy each other', 'حسود pl. حسد ḥusud envious'), provider('hanswehr'));

  it('gives the opening verb paragraph Form I, a form line its numeral and the root as headword, a noun none', () => {
    expect(entries.map((e) => e.verbForm)).toEqual(['I', 'VI', undefined]);
    expect(entries.map((e) => e.headword)).toEqual(['حسد', 'حسد', 'حسود']);
    expect(entries[1].headLength).toBeUndefined();
    expect(entries[2].headLength).toBe('حسود'.length);
  });
});

describe('articleEntries: Al-Ṣiḥāḥ', () => {
  it('takes the opening word, without its punctuation, as the headword', () => {
    const entries = articleEntries(row('وفى', 'والوَفاةُ: الموتُ.', 'واسْتَوْفى حقّه'), provider('alsihah'));
    expect(entries.map((e) => e.headword)).toEqual(['والوَفاةُ', 'واسْتَوْفى']);
    // An Arabic entry keeps its opening word in the text: it is drawn as running text, with no heading row.
    expect(entries[0].headLength).toBeUndefined();
  });

  it('starts a new entry only at و + a word of the root; sayings, quotations and verse tails join the one before', () => {
    const entries = articleEntries(
      row(
        'قلب',
        'القَلْب: الفؤاد.',
        'وقلبت الشئ فانقلبَ (١).',
        'وقولهم: ما به قَلَبَةٌ.',
        'وقال ابن الاعرابي: معناه ليست به علة.',
        'والقَليب: البئر قبل أن تُطْوى.',
        'عن قُلُبٍ ضُجْمٍ تُوَرِّي من سبر *',
        '(١) الحبار بفتح الحاء.',
        '(٢) هو كثير.',
      ),
      provider('alsihah'),
    );
    expect(entries.map((e) => e.headword)).toEqual(['القَلْب', 'وقلبت', 'والقَليب']);
    // The saying and the quotation join وقلبت, and so does the note it cites; the uncited note joins the last entry.
    expect(entries[1].senses.map((s) => s.gloss.split(' ')[0])).toEqual(['وقلبت', 'وقولهم:', 'وقال', '(١)']);
    expect(entries[2].senses.map((s) => s.gloss.split(' ')[0])).toEqual(['والقَليب:', 'عن', '(٢)']);
  });

  it('tells و + a word of the root from و + a saying', () => {
    expect(opensNewWord('وقَلَبْتُ القومَ', 'قلب')).toBe(true);
    expect(opensNewWord('والمُنْقَلَبُ يكون مكاناً', 'قلب')).toBe(true);
    expect(opensNewWord('وقولهم: هو عربي', 'قلب')).toBe(false);
    expect(opensNewWord('وقال الأصمعي', 'قلب')).toBe(false);
    expect(opensNewWord('عن قُلُبٍ', 'قلب')).toBe(false);
  });
});

describe('articleEntries: Al-Wasīṭ', () => {
  const meanings = '(كَتَبَ) الكتابَ: خطَّهُ. و- السقاءَ: خرزَه.<br>(أَكْتَبَهُ): علَّمه.<br>و- orphan continuation';

  it('splits the run-on "و-" senses, then makes an entry of each lead form with its continuations', () => {
    expect(wasitSenses(meanings)).toHaveLength(4);
    const entries = articleEntries({ id: 3, word: 'كتب', meanings }, provider('alwasit'));
    expect(entries.map((e) => e.headword)).toEqual(['كَتَبَ', 'أَكْتَبَهُ']);
    expect(entries.map((e) => e.senses.length)).toEqual([2, 2]);
    expect(entries.every((e) => e.root === 'كتب' && e.articleKey === '3' && e.language === 'ar')).toBe(true);
  });
});

describe('articleEntries: Maqāyīs', () => {
  it('keeps the article as one entry whose paragraphs are the senses', () => {
    const entries = articleEntries(row('وفى', '(وَفَى) الْوَاوُ', '(وَمِنْهُ) يُقَالُ'), provider('almaqayis'));
    expect(entries).toHaveLength(1);
    expect(entries[0].senses).toHaveLength(2);
    expect(entries[0].articleKey).toBeUndefined();
  });
});

describe('romanForm', () => {
  it('numbers forms I to X only', () => {
    expect([1, 6, 10, 11, 0, undefined].map(romanForm)).toEqual(['I', 'VI', 'X', undefined, undefined, undefined]);
  });
});
