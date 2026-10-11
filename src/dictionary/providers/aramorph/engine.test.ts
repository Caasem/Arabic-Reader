import { describe, expect, it } from 'vitest';
import {
  AramorphEngine,
  buildHiddenMasdars,
  createDictTable,
  createMorphTableFromText,
  parseRootHeader,
  rootFromVerbLemma,
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
  ';--- Hsd',
  ';; taHAsad_1',
  'tHAsd\ttaHAsad\tPV\tenvy',
  ';--- Erf',
  ';; taEAraf_1',
  'tEArf\ttaEAraf\tPV\tget acquainted',
  ';; taEAruf_1',
  'tEArf\ttaEAruf\tN\tacquaintance',
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

  it('gives a headerless group the root of its verb, and leaves verbless groups alone', () => {
    const stems = createDictTable(
      [
        ';--- bEd',
        ';; baEud-u_1',
        'bEd\tbaEud\tPV\tbe far',
        ';',
        ';; tabAEad_1',
        'tbAEd\ttabAEad\tPV\tdiverge',
        ';; tabAEud_1',
        'tbAEd\ttabAEud\tNduAt\testrangement',
        ';',
        ';; bagol_1',
        'bgl\tbagol\tN\tmule',
      ].join('\n'),
    );
    expect(stems.get('tbAEd').map((e) => e.root)).toEqual(['bEd', 'bEd']);
    expect(stems.get('bgl')[0].root).toBe('---');
  });
});

describe('rootFromVerbLemma', () => {
  it('reads the radicals off Forms I-X and quadriliterals, in the headers own spelling', () => {
    expect(rootFromVerbLemma('jazaE')).toBe('jzE');
    expect(rootFromVerbLemma('Dar~as')).toBe('Drs');
    expect(rootFromVerbLemma('>aboraq')).toBe('brq');
    expect(rootFromVerbLemma('ta>aj~al')).toBe('Ajl');
    expect(rootFromVerbLemma('{inojaHar')).toBe('jHr');
    expect(rootFromVerbLemma('{ijotaHar')).toBe('jHr');
    expect(rootFromVerbLemma('{isotavomar')).toBe('vmr');
    expect(rootFromVerbLemma('tajarojar')).toBe('jrjr');
    expect(rootFromVerbLemma('mad~')).toBe('md');
  });

  it('gives up on weak verbs rather than guess', () => {
    expect(rootFromVerbLemma('qAl')).toBeNull();
    expect(rootFromVerbLemma('ramaY')).toBeNull();
    expect(rootFromVerbLemma('daEA')).toBeNull();
  });
});

describe('parseRootHeader', () => {
  it('reads both spellings of a disputed root, first one listed first', () => {
    expect(parseRootHeader('ktb')).toEqual({ root: 'ktb' });
    expect(parseRootHeader('Asw/y')).toEqual({ root: 'Asw', altRoot: 'Asy' });
    expect(parseRootHeader('nw/yf')).toEqual({ root: 'nwf', altRoot: 'nyf' });
    expect(parseRootHeader('$fh/w')).toEqual({ root: '$fh', altRoot: '$fw' });
    expect(parseRootHeader('Dwr/Dyr')).toEqual({ root: 'Dwr', altRoot: 'Dyr' });
  });
});

describe('weak roots (و or ي)', () => {
  const parse = (lines: string[]) => createDictTable(lines.join('\n'));

  it('leads a rootless weak verb with the letter its own stems show, the other one second', () => {
    const stems = parse([
      ';; banaY-i_1',
      'bnY\tbanaY\tPV_0\tbuild',
      'bny\tbanay\tPV_Atn\tbuild',
      'bny\tboniy\tIV_0hAnn\tbuild',
      ";; binA'_1",
      "bnA'\tbinA'\tN\tbuilding",
      ';',
      ';; badA-u_1',
      'bdA\tbadA\tPV_h\tappear',
      'bdw\tbadaw\tPV_Atn\tappear',
    ]);
    expect(stems.get("bnA'")[0]).toMatchObject({ root: 'bny', altRoot: 'bnw' });
    expect(stems.get('bdw')[0]).toMatchObject({ root: 'bdw', altRoot: 'bdy' });
  });

  it('does not trust a derived form, whose stems always show ي, and uses the root filed elsewhere', () => {
    const stems = parse([
      ';--- bdw',
      ';; badiyhap_1',
      'bdyh\tbadiyhap\tN\tintuition',
      ';',
      ';; >abodaY_1',
      '>bdY\t>abodaY\tPV_0\tshow',
      '>bdy\t>aboday\tPV_Atn\tshow',
    ]);
    expect(stems.get('>bdY')[0]).toMatchObject({ root: 'bdw', altRoot: 'bdy' });
  });

  it('lets each verb under a disputed header lead with its own letter', () => {
    const stems = parse([
      ';--- nfw/y',
      ';; nafA-u_1',
      'nfA\tnafA\tPV_h\tbe chased away',
      'nfw\tnofuw\tIV\tbe chased away',
      ';; nafaY-i_1',
      'nfY\tnafaY\tPV_0\tdeny',
      'nfy\tnofiy\tIV\tdeny',
    ]);
    expect(stems.get('nfA')[0]).toMatchObject({ root: 'nfw', altRoot: 'nfy' });
    expect(stems.get('nfY')[0]).toMatchObject({ root: 'nfy', altRoot: 'nfw' });
  });

  it('reports the other spelling with each lookup result', () => {
    const engine = new AramorphEngine();
    const tables = buildTables();
    tables.dictstems = parse([';--- nfw/y', ';; nafaY-i_1', 'nfY\tnafaY\tPV\tdeny', 'nfy\tnofiy\tIV\tdeny']);
    engine.setTables(tables);
    expect(engine.lookup('نفى')[0]).toMatchObject({ root: 'نفي', altRoot: 'نفو' });
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

  it('drops the article when the noun with ال is unknown, to reach the verb', () => {
    // The slice has no Al- prefix or noun form of katab, like تحاسد in the real data.
    const engine = new AramorphEngine();
    engine.setTables(buildTables());
    expect(engine.lookup('الكتب')[0]).toMatchObject({ root: 'كتب', lemma: 'كَتَب' });
    expect(engine.lookup('وبالكتب')[0]).toMatchObject({ root: 'كتب' });
    expect(engine.lookup('الزززز')).toEqual([]);
  });

  it('makes missing Form V/VI verbal nouns as hidden stems that carry the root', () => {
    const tables = buildTables();
    const hidden = buildHiddenMasdars(tables.dictstems);
    expect(hidden.get('tHAsd')).toEqual([expect.objectContaining({ word: 'taHAsud', root: 'Hsd', lemma: 'taHAsad', hidden: true })]);
    expect(hidden.get('tEArf')).toEqual([]); // the data already has تَعارُف
    expect(tables.dictstems.get('tHAsd')).toHaveLength(1); // the parse itself is untouched

    const engine = new AramorphEngine();
    engine.setTables(tables);
    const results = engine.lookup('تحاسد');
    expect(results.find((r) => r.hidden)).toMatchObject({ root: 'حسد', lemma: 'تَحاسَد', word: 'تَحاسُد' });
    expect(results.find((r) => !r.hidden)).toMatchObject({ root: 'حسد', def: 'envy' });
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
