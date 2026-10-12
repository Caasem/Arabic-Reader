import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DictionaryEntry } from '../types';
import { TRAIT_PROVIDER_IDS } from './providerTraits';
import { ITALIC_CLOSE, ITALIC_OPEN } from './senseFormat/laneItalics';
import { CHECKS, evaluate, renderMatrix, type Outcome, type Subject } from './conformance/checklist';
import { AramorphEngine, createDictTable, createMorphTableFromText, type AramorphTables } from './providers/aramorph/engine';
import { groupAramorphResults } from './providers/aramorph/groupResults';
import { RootArticleProvider } from './providers/rootArticle/RootArticleProvider';
import { rowsToEntries } from './providers/personal/rowsToEntries';
import type { PersonalRow } from './providers/personal/parse';

// AraMorph needs a Worker. What the root dictionaries ask it, a fixture answers.
const box = vi.hoisted(() => ({ analyses: [] as Record<string, unknown>[] }));
vi.mock('./providers/aramorph/AramorphDictionaryProvider', () => ({
  aramorphProvider: { id: 'aramorph', name: 'AraMorph', analyze: async () => box.analyses, lookup: async () => [], verbFamily: async () => [] },
}));

const MATRIX_PATH = path.resolve(__dirname, '../../docs/features/dictionary-feature-matrix.md');

const NAMES: Record<string, string> = {
  aramorph: 'AraMorph',
  alwasit: 'Al-Wasīṭ',
  alsihah: 'Al-Ṣiḥāḥ',
  almaqayis: 'Maqāyīs',
  lane: 'Lane',
  hanswehr: 'Hans Wehr',
  baranov: 'Baranov',
  personal: 'Personal file',
};

const joinLines = (l: string[]) => l.join('<br>');

const LANE = [
  'حَسَدَهُ عَلَى الشَّىْءِ 1 and , (S, A, Msb, K,) aor. ﹹ and ﹻ, …',
  'حَسَّدَ 2 see 1.',
  'صَحِبْتُهُ فَأَحْسَدْتُهُ 4 I associated with him and found him to be envious. (A.)',
  'تحاسدوا 6 They envied (حَسَدُوا) one another. (S, A, * K.)',
  `حَسَدٌ ${ITALIC_OPEN}Envy${ITALIC_CLOSE}; or the wishing that a blessing … may depart from its possessor.`,
  'حَسُودٌ Envious: (Msb, K:) used also as a fem. epithet without ة: (TA:) pl. حُسُدٌ. (K.)',
  'حَاسِدٌ Envying: (S, Msb, K:) pl. حَسَدَةٌ',
  'المَحْسَدَةُ مَفْسَدَةٌ [That which is a cause of envy is a cause of corruption, or evil]. (A.)',
];

const HANS_WEHR = [
  'حسد ḥasada u (ḥasad) to envy, grudge (ه s.o., على or هـ s.th.)',
  'II to make envious',
  'VI to envy each other',
  'حسد ḥasad envy',
  'حسود pl. حسد ḥusud envious',
  'تحاسد taḥāsud mutual envy',
];

const SIHAH = [
  'الوَفاءُ: ضدُّ الغدر. يقال: وَفى بعهده وأَوْفى بمعنًى.',
  'ووَفى الشئ وفيا، على فعول، أي تم وكثر.',
  'وأوفى على الشئ، أي أشرف.',
  'واسْتَوْفى حقّه وتَوَفَّاهُ بمعنًى.',
  'والوَفاةُ: الموتُ.',
  '(١) حميد الارقط.',
];

const WASIT = [
  '(كَتَبَ) الكتابَ -ُ كَتْبًا: خطَّهُ.',
  'و- السقاءَ ونحوه: خرزَه بسَيرين.',
  '(أَكْتَبَهُ): علَّمه الكتابة.',
  '(كَاتَبَ) صديقَه: راسله.',
  '(تَكَاتَبَ) القومُ: كتبَ بعضُهم إلى بعض.',
];

const MAQAYIS = ['(وَفَى) الْوَاوُ وَالْفَاءُ وَالْحَرْفُ الْمُعْتَلُّ: كَلِمَةٌ تَدُلُّ عَلَى إِكْمَالٍ.', '(وَمِنْهُ) يُقَالُ لِلْمَيِّتِ.'];

const ROWS: PersonalRow[] = [
  ['كِتَابٌ', 'книга'],
  ['بَيْتٌ', 'дом'],
  ['بَابٌ', 'дверь'],
  ['قَلَمٌ', 'ручка'],
  ['مَدْرَسَةٌ', 'школа'],
];

const STEMS = [';--- ktb', ';; katab-u_1', 'ktb\tkatab\tPV\twrite', 'ktb\tkotub\tIV\twrite', ';; kitAb_1', 'ktAb\tkitAb\tNdu\tbook'].join('\n');

function aramorphEntries(): DictionaryEntry[] {
  const tables: AramorphTables = {
    dictprefs: createDictTable('\t\tPref-0\t'),
    dictstems: createDictTable(STEMS),
    dictsuffs: createDictTable('\t\tSuff-0\t'),
    tableab: createMorphTableFromText(['Pref-0 PV', 'Pref-0 IV', 'Pref-0 Ndu'].join('\n')),
    tablebc: createMorphTableFromText(['PV Suff-0', 'IV Suff-0', 'Ndu Suff-0'].join('\n')),
    tableac: createMorphTableFromText('Pref-0 Suff-0'),
  };
  const engine = new AramorphEngine();
  engine.setTables(tables);
  return groupAramorphResults(engine.lookup('كتب'), 'aramorph', 'AraMorph');
}

async function article(id: string, root: string, units: string[], word: string, analyses: Record<string, unknown>[]): Promise<DictionaryEntry[]> {
  box.analyses = analyses;
  const tsv = `${root}\t${joinLines(units)}\n`;
  return new RootArticleProvider(id, NAMES[id], async () => tsv).lookup(word);
}

async function buildSubjects(): Promise<Subject[]> {
  const aramorph = aramorphEntries();
  const verbVI = { lemma: 'تَحاسَد', root: 'حسد', form: 'VI' };
  return [
    { id: 'aramorph', entries: aramorph, word: 'كتب', analyses: [], lands: aramorph.map((_, i) => i) },
    {
      id: 'lane',
      articleEntries: LANE.length,
      entries: await article('lane', 'حسد', LANE, 'تحاسدوا', [verbVI]),
      word: 'تحاسدوا',
      analyses: [verbVI],
      lands: [3],
    },
    {
      id: 'hanswehr',
      articleEntries: HANS_WEHR.length,
      entries: await article('hanswehr', 'حسد', HANS_WEHR, 'تحاسدوا', [verbVI]),
      word: 'تحاسدوا',
      analyses: [verbVI],
      lands: [2],
    },
    {
      id: 'alsihah',
      articleEntries: SIHAH.length,
      entries: await article('alsihah', 'وفى', SIHAH, 'وفاة', [{ lemma: 'وَفاة', root: 'وفى' }]),
      word: 'وفاة',
      analyses: [{ lemma: 'وَفاة', root: 'وفى' }],
      lands: [4],
    },
    {
      id: 'alwasit',
      articleEntries: 4,
      entries: await article('alwasit', 'كتب', WASIT, 'كاتبته', [{ lemma: 'كَاتَبَ', root: 'كتب', form: 'III' }]),
      word: 'كاتبته',
      analyses: [{ lemma: 'كَاتَبَ', root: 'كتب', form: 'III' }],
      lands: [2],
    },
    {
      id: 'almaqayis',
      articleEntries: MAQAYIS.length,
      entries: await article('almaqayis', 'وفى', MAQAYIS, 'وفى', [{ lemma: 'وَفَى', root: 'وفى' }]),
      word: 'وفى',
      analyses: [{ lemma: 'وَفَى', root: 'وفى' }],
      lands: [0],
    },
    { id: 'baranov', entries: rowsToEntries(ROWS, 'baranov', 'Baranov'), word: 'بيت', analyses: [], lands: [1] },
    { id: 'personal', entries: rowsToEntries(ROWS, 'personal', 'Personal file'), word: 'بيت', analyses: [], lands: [1] },
  ];
}

describe('dictionary conformance', () => {
  it('has a fixture for every dictionary with declared traits', async () => {
    const subjects = await buildSubjects();
    expect(subjects.map((s) => s.id).sort()).toEqual([...TRAIT_PROVIDER_IDS].sort());
  });

  it('runs every dictionary through the whole checklist with only documented exceptions and expected gaps', async () => {
    const subjects = await buildSubjects();
    const surprises: string[] = [];
    const results = subjects.map((s) => {
      const outcomes = evaluate(s);
      for (const c of CHECKS) {
        const o: Outcome = outcomes[c.id];
        if (o.kind === 'unexpected') surprises.push(`${s.id} / ${c.id}: ${o.why}`);
      }
      return { id: s.id, name: NAMES[s.id], outcomes };
    });
    expect(surprises).toEqual([]);

    const matrix = renderMatrix(results);
    if (process.env.UPDATE_MATRIX) fs.writeFileSync(MATRIX_PATH, matrix);
    expect(fs.readFileSync(MATRIX_PATH, 'utf8').replace(/\r\n/g, '\n'), 'run UPDATE_MATRIX=1 npx vitest run src/dictionary/conformance.test.ts').toBe(matrix);
  });
});
