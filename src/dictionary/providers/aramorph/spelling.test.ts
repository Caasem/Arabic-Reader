import { describe, expect, it } from 'vitest';
import { AramorphEngine, cleanQuranicMarks, createDictTable, createMorphTableFromText, spellingVariants } from './engine';

// Stems keyed the way the data keys them (Buckwalter, no vowels).
const STEMS = [
  ';--- h*',
  ';; hA*A_1',
  'h*A\thA*A\tN\tthis',
  ';--- ktb',
  ';; kitAb_1',
  'ktAb\tkitAb\tN\tbook',
  ';; kitAb_2',
  'ktb\tkutub\tN\tbooks',
  ';--- Zlm',
  ';; ZAlim_1',
  'ZAlmyn\tZAlimiyna\tN\twrongdoers',
  ';--- smE',
  ';; <isomAEiyl_1',
  '<smAEyl\t<isomAEiyl\tN\tIsmail',
  ';--- Sxb',
  ';; $AT}_1',
  '$AT}\t$ATi}\tN\tshore',
  ';--- slm',
  ';; sulayomAn_1',
  'slymAn\tsulayomAn\tN\tSolomon',
  ';--- ktp',
  'rHmn\tHamomn\tN\tnothing',
].join('\n');

function engine(): AramorphEngine {
  const e = new AramorphEngine();
  e.setTables({
    dictprefs: createDictTable(['\t\tPref-0\t', 'Al\tAl\tPref-Al\tthe <pos>Al/DET</pos>'].join('\n')),
    dictstems: createDictTable(STEMS),
    dictsuffs: createDictTable(['\t\tSuff-0\t'].join('\n')),
    tableab: createMorphTableFromText(['Pref-0 N', 'Pref-Al N'].join('\n')),
    tablebc: createMorphTableFromText('N Suff-0'),
    tableac: createMorphTableFromText(['Pref-0 Suff-0', 'Pref-Al Suff-0'].join('\n')),
  });
  return e;
}

describe('cleanQuranicMarks', () => {
  it('removes annotation marks and tatweel, writes ٱ as ا and the Qur’anic sukun as a sukun', () => {
    expect(cleanQuranicMarks('ٱلْكِتَٰبُ')).toBe('الْكِتَٰبُ');
    expect(cleanQuranicMarks('مِنۢ')).toBe('مِن');
    expect(cleanQuranicMarks('ٱلۡحَمۡدُ')).toBe('الْحَمْدُ');
    expect(cleanQuranicMarks('كـتاب')).toBe('كتاب');
  });
});

describe('spellingVariants', () => {
  it('tries the dagger alif both dropped and written out, then يء, then a missing long ā', () => {
    expect(spellingVariants('هَٰذَا')[0]).toEqual(['هَذَا', 'هَاذَا']);
    expect(spellingVariants('شاطيء')[0]).toEqual(['شاطئ']);
    expect(spellingVariants('سليمن').flat()).toContain('سليمان');
  });

  it('never puts an ا at the start, next to a long vowel letter, or straight after the article', () => {
    const all = spellingVariants('الظلمين').flat();
    expect(all).toContain('الظالمين');
    expect(all).not.toContain('الاظلمين');
    expect(all.every((v) => !v.startsWith('اا') && !v.includes('اا'))).toBe(true);
    expect(spellingVariants('بيت').flat()).toEqual([]); // ي on both sides of every gap but the ends
  });

  it('has nothing to try for a word that is already plain', () => {
    expect(spellingVariants('ك')).toEqual([]);
  });
});

describe('AramorphEngine.lookup with Qur’anic and classical spellings', () => {
  const e = engine();
  const words = (w: string) => e.lookup(w).map((r) => r.word.replace(/[ً-ْٰ]/g, ''));

  it('reads a dagger alif that stands for nothing (هَٰذَا, ذَٰلِكَ-type)', () => {
    expect(words('هَٰذَا')).toEqual(['هاذا']);
    expect(e.lookup('هَٰذَا')[0]).toMatchObject({ root: 'هذ' });
  });

  it('reads a dagger alif that stands for ā, and ٱ', () => {
    expect(e.lookup('الظَّٰلِمِينَ')[0]).toMatchObject({ root: 'ظلم' });
    expect(e.lookup('إِسْمَٰعِيلَ')[0]).toMatchObject({ lemma: 'إِسْماعِيل' });
    expect(e.lookup('سُلَيْمَٰنَ')[0]).toMatchObject({ root: 'سلم' });
  });

  it('tries both readings of a dagger alif and keeps both', () => {
    // ٱلْكِتَٰبُ: dropping the dagger gives كتب (books), writing it out gives كتاب (book).
    const found = e.lookup('الْكِتَٰبُ').map((r) => r.word.replace(/[ً-ْ]/g, '')).sort();
    expect(found).toEqual(['الكتاب', 'الكتب']);
  });

  it('reads يء as ئ', () => {
    expect(e.lookup('شاطيء')[0]).toMatchObject({ lemma: 'شاطئ' });
  });

  it('puts back the long ā of a defective spelling', () => {
    expect(e.lookup('إسمعيل')[0]).toMatchObject({ lemma: 'إِسْماعِيل' });
    expect(e.lookup('سليمن')[0]).toMatchObject({ lemma: 'سُلَيْمان' });
    expect(e.lookup('الظلمين')[0]).toMatchObject({ root: 'ظلم' });
  });

  it('does not touch a word that already has an answer', () => {
    expect(e.lookup('كتاب')).toHaveLength(1);
    expect(e.lookup('كتاب')[0].lemma).toBe('كِتاب');
  });

  it('still finds nothing for a word that is not in the dictionary', () => {
    expect(e.lookup('زززز')).toEqual([]);
  });
});
