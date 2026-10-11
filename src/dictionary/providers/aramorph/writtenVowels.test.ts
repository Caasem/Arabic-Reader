import { afterEach, describe, expect, it, vi } from 'vitest';
import { AramorphEngine, createDictTable, createMorphTableFromText, transliterate, vowelsClash } from './engine';
import type { AramorphResult } from './engine';

const STEMS = [
  ';--- mSr',
  ';; miSor_1',
  'mSr\tmiSor\tN\tEgypt',
  ';--- Srr',
  ';; muSir~_1',
  'mSr\tmuSir~\tN\tpersistent',
  ';--- ktb',
  ';; kutub_1',
  'ktb\tkutub\tN\tbooks',
  ';; katab-u_1',
  'ktb\tkatab\tPV\twrite',
].join('\n');

function engine(): AramorphEngine {
  const e = new AramorphEngine();
  e.setTables({
    dictprefs: createDictTable('\t\tPref-0\t'),
    dictstems: createDictTable(STEMS),
    dictsuffs: createDictTable('\t\tSuff-0\t'),
    tableab: createMorphTableFromText(['Pref-0 N', 'Pref-0 PV'].join('\n')),
    tablebc: createMorphTableFromText(['N Suff-0', 'PV Suff-0'].join('\n')),
    tableac: createMorphTableFromText('Pref-0 Suff-0'),
  });
  return e;
}

const clash = (written: string, reading: string) => vowelsClash(transliterate(written), transliterate(reading));

describe('vowelsClash', () => {
  it('flags a different vowel on the same letter', () => {
    expect(clash('مِصْر', 'مُصِرّ')).toBe(true);
    expect(clash('بَيْت', 'بَيَّتَ')).toBe(true); // sukun against shadda + vowel
  });

  it('accepts a written vowel the reading shares, and a reading with no vowels', () => {
    expect(clash('مِصْر', 'مِصْر')).toBe(false);
    expect(clash('مِصْر', 'مصر')).toBe(false);
    expect(clash('مصر', 'مِصْر')).toBe(false); // nothing written: nothing to contradict
    expect(clash('رَجُل', 'رَجِل')).toBe(true);
  });

  it('does not compare the last letter (case endings)', () => {
    expect(clash('بَعْدَ', 'بَعْدُ')).toBe(false);
    expect(clash('بَعْدَ', 'بَعْدِ')).toBe(false);
  });

  it('does not judge spellings whose letters do not line up', () => {
    expect(clash('إِسْمَاعِيل', 'إِسْماعِيل')).toBe(false);
    expect(clash('هَذَا', 'هَاذَا')).toBe(false);
  });

  it('tries a written dagger alif both as nothing and as ā', () => {
    expect(clash('سُلَيْمَٰنَ', 'سَلِيمانِ')).toBe(true);
    expect(clash('سُلَيْمَٰنَ', 'سُلَيْمان')).toBe(false);
    expect(clash('هَٰذَا', 'هٰذَا')).toBe(false);
  });

  it('lets a written shadda disagree only with a reading that has other marks but no shadda', () => {
    expect(clash('كَتَّبَ', 'كَتَبَ')).toBe(true);
    expect(clash('كَتَّبَ', 'كتب')).toBe(false);
    expect(clash('كَتَبَ', 'كَتَّبَ')).toBe(true);
  });
});

describe('AramorphEngine.lookup with written vowels', () => {
  it('ranks the readings that match the vowels first, and keeps every reading', () => {
    const e = engine();
    const bare = e.lookup('مصر');
    const vowelled = e.lookup('مِصْرَ');
    expect(vowelled).toHaveLength(bare.length);
    expect(vowelled.map((r) => r.root)).toEqual(['مصر', 'صرر']);
    expect(vowelled[0].vowelClash).toBeUndefined();
    expect(vowelled[1].vowelClash).toBe(true);
  });

  it('puts the matching verb reading first for a vowelled word', () => {
    const e = engine();
    const [first, second] = e.lookup('كَتَبَ');
    expect(first).toMatchObject({ word: 'كَتَب' });
    expect(second).toMatchObject({ word: 'كُتُب', vowelClash: true });
  });

  it('leaves a word without vowels exactly as before', () => {
    const e = engine();
    const results = e.lookup('مصر');
    expect(results.map((r) => r.root)).toEqual(['مصر', 'صرر']);
    expect(results.some((r) => r.vowelClash)).toBe(false);
  });

  it('flags nothing and keeps the order when every reading disagrees', () => {
    const e = engine();
    const results = e.lookup('مُصْرَ'); // مُ against مِ in one reading, muSir~ has a shadda the text lacks
    const bare = e.lookup('مصر');
    expect(results.map((r) => r.word)).toEqual(bare.map((r) => r.word));
    expect(results.some((r) => r.vowelClash)).toBe(false);
  });
});

describe('the provider with written vowels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function providerWith(results: AramorphResult[]) {
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onmessage?.({ data: { id: 0, type: 'ready', tableSizes: { dictstems: 1 } } } as MessageEvent));
      }
      postMessage(msg: { id: number }) {
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, type: 'lookupResult', results } } as MessageEvent));
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const { aramorphProvider } = await import('./AramorphDictionaryProvider');
    return aramorphProvider;
  }

  const reading = (word: string, root: string, vowelClash?: boolean): AramorphResult => ({
    root,
    lemma: word,
    word,
    def: 'gloss ' + word,
    pos: '',
    morph: 'N',
    ...(vowelClash ? { vowelClash } : {}),
  });

  it('keeps the engine order, flags an entry whose readings all clash, and analyses the matching root first', async () => {
    const provider = await providerWith([reading('مِصْر', 'مصر'), reading('مُصِرّ', 'صر', true), reading('مَصَر', 'مصر', true)]);
    const entries = await provider.lookup('مِصْرَ');
    expect(entries.map((e) => e.headword)).toEqual(['مِصْر', 'مُصِرّ', 'مَصَر']);
    expect(entries.map((e) => e.vowelClash)).toEqual([undefined, true, true]);
    const analyses = await provider.analyze('مِصْرَ');
    expect(analyses[0].root).toBe('مصر');
  });

  it('puts matching readings first in the analyses even if handed over in another order', async () => {
    const provider = await providerWith([reading('مُصِرّ', 'صر', true), reading('مِصْر', 'مصر')]);
    const analyses = await provider.analyze('مِصْرَ ');
    expect(analyses.map((a) => a.root)).toEqual(['مصر', 'صر']);
  });
});
