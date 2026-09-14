import { describe, expect, it } from 'vitest';
import {
  AramorphEngine,
  createDictTable,
  createMorphTableFromText,
  deserializeTables,
  detransliterate,
  serializeTables,
  transliterate,
  type AramorphTables,
} from './engine';

// A tiny, structurally faithful slice of the AraMorph data files.
const DICT_PREFIXES = ['; header', '\t\tPref-0\t', 'w\twa\tPref-Wa\tand <pos>wa/CONJ+</pos>'].join('\n');
const DICT_SUFFIXES = ['; header', '\t\tSuff-0\t'].join('\n');
const DICT_STEMS = [
  ';--- ktb',
  ';; katab-u_1',
  'ktb\tkatab\tPV\twrite',
  ';; >akotab_1',
  'Aktb\t>akotab\tPV\tdictate;make write',
  ';',
  'qlm\tqalam\tN\tpen <pos>qalam/NOUN</pos>',
].join('\n');
const TABLE_AB = ['; header', 'Pref-0 PV', 'Pref-0 N', 'Pref-Wa PV'].join('\n');
const TABLE_BC = ['PV Suff-0', 'N Suff-0'].join('\n');
const TABLE_AC = ['Pref-0 Suff-0', 'Pref-Wa Suff-0'].join('\n');

function buildTables(): AramorphTables {
  return {
    dictprefs: createDictTable(DICT_PREFIXES),
    dictstems: createDictTable(DICT_STEMS),
    dictsuffs: createDictTable(DICT_SUFFIXES),
    tableab: createMorphTableFromText(TABLE_AB),
    tablebc: createMorphTableFromText(TABLE_BC),
    tableac: createMorphTableFromText(TABLE_AC),
  };
}

describe('Buckwalter transliteration', () => {
  it('round-trips letters and diacritics', () => {
    expect(detransliterate('katab')).toBe('كَتَب');
    expect(transliterate('كَتَبَ')).toBe('kataba');
    expect(transliterate(detransliterate('>akotab'))).toBe('>akotab');
  });

  it('leaves characters outside the table untouched', () => {
    expect(transliterate('كتب 12!')).toBe('ktb 12!');
    expect(detransliterate('')).toBe('');
  });

  it('matches the original regex-per-letter implementation exactly', () => {
    // The pre-optimization implementation, kept here as the reference.
    const escape = (s: string) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const buckwalter = "'|>&<}AbptvjHxd*rzs$SDTZEg_fqklmnhwYyFNKaui~o`{";
    const arabic = Array.from(buckwalter, (ch) => detransliterate(ch));
    const referenceDetransliterate = (word: string) =>
      Array.from(buckwalter).reduce((acc, ch, i) => acc.replace(new RegExp(escape(ch), 'g'), arabic[i]), word);
    const referenceTransliterate = (word: string) =>
      Array.from(buckwalter).reduce((acc, ch, i) => acc.replace(new RegExp(escape(arabic[i]), 'g'), ch), word);

    const alphabet = buckwalter + arabic.join('') + 'xyz 01-.،';
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 300; n++) {
      const sample = Array.from({ length: 1 + Math.floor(random() * 12) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      expect(detransliterate(sample)).toBe(referenceDetransliterate(sample));
      expect(transliterate(sample)).toBe(referenceTransliterate(sample));
    }
  });
});

describe('createDictTable', () => {
  it('tracks root and lemma markers and extracts the <pos> tag from the gloss', () => {
    const stems = createDictTable(DICT_STEMS);
    const [katab] = stems.get('ktb');
    expect(katab).toMatchObject({ root: 'ktb', lemma: 'katab', word: 'katab', morph: 'PV', def: 'write' });
    expect(stems.get('Aktb')[0]).toMatchObject({ lemma: '>akotab', def: 'dictate, make write' });
    // A bare ';' line resets both markers.
    expect(stems.get('qlm')[0]).toMatchObject({ root: '---', lemma: '---', def: 'pen', pos: 'qalam/NOUN' });
  });
});

describe('AramorphEngine.lookup', () => {
  it('matches a bare stem with its root and citation form', () => {
    const engine = new AramorphEngine();
    engine.setTables(buildTables());
    const [result] = engine.lookup('كتب');
    expect(result).toMatchObject({ root: 'كتب', lemma: 'كَتَب', word: 'كَتَب', def: 'write' });
  });

  it('combines a prefix, stem, and suffix that obey the grammar tables', () => {
    const engine = new AramorphEngine();
    engine.setTables(buildTables());
    const results = engine.lookup('وكتب');
    expect(results.map((r) => r.def)).toContain('[and] write');
    expect(results.find((r) => r.def === '[and] write')?.pos).toBe('wa/CONJ+');
  });

  it('returns nothing before tables are loaded or for unknown words', () => {
    const engine = new AramorphEngine();
    expect(engine.lookup('كتب')).toEqual([]);
    engine.setTables(buildTables());
    expect(engine.lookup('زززز')).toEqual([]);
  });

  it('survives a serialize/deserialize round trip', () => {
    const engine = new AramorphEngine();
    engine.setTables(deserializeTables(serializeTables(buildTables())));
    expect(engine.lookup('كتب')[0]?.def).toBe('write');
  });
});
