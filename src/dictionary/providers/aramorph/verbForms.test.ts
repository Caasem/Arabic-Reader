import { describe, expect, it } from 'vitest';
import { AramorphEngine, createDictTable, createMorphTableFromText, type AramorphTables } from './engine';

// Real lemma markers from dictstems: Form I with an imperfect vowel, a Form VII verb,
// a Form I verb marked with two vowels, and a noun in the same root.
const STEMS = [
  ';--- ktb',
  ';; katab-u_1',
  'ktb\tkatab\tPV\twrite',
  'ktb\tkotub\tIV\twrite',
  ';; {inokatab_1',
  '<nktb\t{inokatab\tPV\tsubscribe',
  'Anktb\t{inokatab\tPV\tsubscribe',
  ';; kitAb_1',
  'ktAb\tkitAb\tNdu\tbook',
  ';--- >bd',
  ';; >abad-ui_1',
  '>bd\t>abad\tPV\tlast forever',
].join('\n');

function tables(): AramorphTables {
  return {
    dictprefs: createDictTable('\t\tPref-0\t'),
    dictstems: createDictTable(STEMS),
    dictsuffs: createDictTable('\t\tSuff-0\t'),
    tableab: createMorphTableFromText(['Pref-0 PV', 'Pref-0 IV', 'Pref-0 Ndu'].join('\n')),
    tablebc: createMorphTableFromText(['PV Suff-0', 'IV Suff-0', 'Ndu Suff-0'].join('\n')),
    tableac: createMorphTableFromText('Pref-0 Suff-0'),
  };
}

describe('verb forms in the Arabic Dictionary engine', () => {
  it('keeps the imperfect vowel from the lemma marker, even when it is two letters', () => {
    const stems = createDictTable(STEMS);
    expect(stems.get('ktb')[0]).toMatchObject({ lemma: 'katab', lemmaVowel: 'u' });
    expect(stems.get('>bd')[0]).toMatchObject({ lemma: '>abad', lemmaVowel: 'ui' });
    expect(stems.get('ktAb')[0].lemmaVowel).toBeUndefined();
  });

  it('puts the form on a looked-up verb, and the vowel only on Form I', () => {
    const engine = new AramorphEngine();
    engine.setTables(tables());
    expect(engine.lookup('كتب')[0]).toMatchObject({ verbForm: 'I', imperfectVowel: 'u' });
    expect(engine.lookup('انكتب')[0]).toMatchObject({ verbForm: 'VII' });
    expect(engine.lookup('انكتب')[0].imperfectVowel).toBeUndefined();
  });

  it('gives no form to a noun', () => {
    const engine = new AramorphEngine();
    engine.setTables(tables());
    expect(engine.lookup('كتاب')[0].verbForm).toBeUndefined();
  });

  it('lists the verbs the dictionary has for a root, once each', () => {
    const engine = new AramorphEngine();
    engine.setTables(tables());
    const family = engine.verbFamily('ktb');
    expect(family.map((m) => m.form)).toEqual(['I', 'VII']);
    expect(family[0]).toMatchObject({ gloss: 'write', imperfectVowel: 'u' });
    expect(engine.verbFamily('zzz')).toEqual([]);
  });
});
