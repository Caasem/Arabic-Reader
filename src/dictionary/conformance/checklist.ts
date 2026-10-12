import type { DictionaryEntry } from '../../types';
import { buildExampleEntryTokens } from '../../components/reader/definitionTokens';
import { canSelectWords, FOLD_ABOVE, visibleEntryIndexes } from '../entryFeatures';
import { entriesAboutWord, type AnalysisLike } from '../subEntries/match';

/**
 * The checklist every registered dictionary is run through (src/dictionary/conformance.test.ts): the popup's
 * features follow the shape of the data, so each dictionary must produce entries of that shape. A dictionary
 * that legitimately cannot is listed in EXCEPTIONS with the reason; a gap not yet closed is listed in
 * EXPECTED_FAILURES (the test fails when a listed one starts passing, so the list can only shrink).
 */
export type CheckId = 'headword' | 'split' | 'saveable' | 'tokenizable' | 'foldable' | 'landsOnWord';

/** One dictionary's fixture: what its lookup returned for a small, real-shaped article, and what tapping `word` should land on. */
export interface Subject {
  id: string;
  /** How many entries the fixture's article should become (one per line or form); absent: the dictionary lists words, not articles. */
  articleEntries?: number;
  entries: DictionaryEntry[];
  word: string;
  analyses: AnalysisLike[];
  /** Indexes of the entries the tapped word should land on. */
  lands: number[];
}

export interface Check {
  id: CheckId;
  title: string;
  /** Null when the dictionary passes, else why not. */
  run(subject: Subject): string | null;
}

const words = (entry: DictionaryEntry): number => buildExampleEntryTokens(entry).flat.filter((t) => t.isWord).length;

export const CHECKS: Check[] = [
  {
    id: 'headword',
    title: 'Returns entries, each with a headword',
    run: ({ entries }) =>
      !entries.length ? 'no entries' : entries.some((e) => !e.headword.trim()) ? 'an entry has no headword' : entries.some((e) => !e.language) ? 'an entry does not say what language it is in' : null,
  },
  {
    id: 'split',
    title: 'A long article is split into sub-entries',
    run: ({ entries, articleEntries }) =>
      articleEntries === undefined || entries.length === articleEntries ? null : `${entries.length} entries for ${articleEntries} lines`,
  },
  {
    id: 'saveable',
    title: 'Every entry is individually saveable (a headword and its own text)',
    run: ({ entries }) => (entries.some((e) => !e.senses.some((s) => s.gloss.trim())) ? 'an entry has no text to save' : null),
  },
  {
    id: 'tokenizable',
    title: 'Its text can be picked word by word',
    run: ({ entries }) => (entries.some((e) => !canSelectWords(e) || words(e) === 0) ? 'an entry cannot be picked word by word' : null),
  },
  {
    id: 'foldable',
    title: `A list longer than ${FOLD_ABOVE} folds to the entry about the tapped word`,
    run: ({ entries, word, analyses }) => {
      if (entries.length <= FOLD_ABOVE) return null;
      const about = entriesAboutWord(entries, word, analyses);
      const shown = visibleEntryIndexes(entries.length, about);
      return shown.length < entries.length && [...about].every((i) => shown.includes(i)) ? null : `all ${entries.length} entries are shown`;
    },
  },
  {
    id: 'landsOnWord',
    title: 'Landing on the word marks the expected entry',
    run: ({ entries, word, analyses, lands }) => {
      const got = [...entriesAboutWord(entries, word, analyses)].sort((a, b) => a - b);
      return JSON.stringify(got) === JSON.stringify(lands) ? null : `marks [${got}], expected [${lands}]`;
    },
  },
];

/** Legitimate exceptions, each with its reason: the matrix prints them and the test accepts a failure only here. */
export const EXCEPTIONS: Record<string, Partial<Record<CheckId, string>>> = {
  almaqayis: { split: "Maqāyīs articles are essays on a root's core meaning, not lists of derived words: one entry per article, its paragraphs as senses." },
};

/** Gaps not yet closed. Each step of the parity work removes some; it ends empty. */
export const EXPECTED_FAILURES: Record<string, CheckId[]> = {
  lane: ['tokenizable', 'foldable'],
  hanswehr: ['tokenizable', 'foldable'],
  alsihah: ['foldable'],
  alwasit: ['foldable'],
  aramorph: ['tokenizable'],
  baranov: ['foldable'],
  personal: ['foldable'],
  almaqayis: [],
};

/** Features that are deliberately not shared, for the matrix. */
export const NOT_SHARED: { feature: string; only: string; reason: string }[] = [
  { feature: 'Greying of readings that clash with the vowels written on the tapped word', only: 'aramorph', reason: 'it is about several readings of one word, which only AraMorph returns' },
];

export type Outcome = { kind: 'pass' } | { kind: 'exception'; reason: string } | { kind: 'gap'; why: string } | { kind: 'unexpected'; why: string };

/** Runs every check on a subject and sorts the results into pass, documented exception, expected gap, or a surprise. */
export function evaluate(subject: Subject): Record<CheckId, Outcome> {
  const out = {} as Record<CheckId, Outcome>;
  for (const check of CHECKS) {
    const why = check.run(subject);
    const exception = EXCEPTIONS[subject.id]?.[check.id];
    if (!why) out[check.id] = exception ? { kind: 'unexpected', why: 'listed as an exception but passes' } : { kind: 'pass' };
    else if (exception) out[check.id] = { kind: 'exception', reason: exception };
    else if (EXPECTED_FAILURES[subject.id]?.includes(check.id)) out[check.id] = { kind: 'gap', why };
    else out[check.id] = { kind: 'unexpected', why };
  }
  for (const id of EXPECTED_FAILURES[subject.id] ?? []) {
    if (out[id]?.kind === 'pass') out[id] = { kind: 'unexpected', why: 'listed as an expected failure but passes: remove it from EXPECTED_FAILURES' };
  }
  return out;
}

/** The feature matrix as Markdown (docs/features/dictionary-feature-matrix.md), generated from the results. */
export function renderMatrix(results: { id: string; name: string; outcomes: Record<CheckId, Outcome> }[]): string {
  const notes: string[] = [];
  const noteFor = (reason: string): number => (notes.includes(reason) ? notes.indexOf(reason) : notes.push(reason) - 1) + 1;
  const cell = (o: Outcome): string => {
    if (o.kind === 'pass') return 'yes';
    if (o.kind === 'exception') return `n/a [${noteFor(o.reason)}]`;
    return o.kind === 'gap' ? 'not yet' : 'FAIL';
  };
  const lines = [
    '# Dictionary feature matrix',
    '',
    'Generated by `src/dictionary/conformance.test.ts` from the checklist in `src/dictionary/conformance/checklist.ts`; do not edit by hand.',
    'To refresh it after changing a dictionary or the checklist: `UPDATE_MATRIX=1 npx vitest run src/dictionary/conformance.test.ts`.',
    '',
    `| Feature | ${results.map((r) => r.name).join(' | ')} |`,
    `| --- | ${results.map(() => '---').join(' | ')} |`,
    ...CHECKS.map((c) => `| ${c.title} | ${results.map((r) => cell(r.outcomes[c.id])).join(' | ')} |`),
    ...NOT_SHARED.map((n) => `| ${n.feature} | ${results.map((r) => (r.id === n.only ? 'yes' : `n/a [${noteFor(n.reason)}]`)).join(' | ')} |`),
  ];
  return [...lines, '', ...notes.map((n, i) => `${i + 1}. ${n}`), ''].join('\n');
}
