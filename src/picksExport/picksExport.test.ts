import { describe, expect, it } from 'vitest';
import type { SensePickRow } from '../persistence/sensePicksRepo';
import { buildSavedEntriesExport, savedEntriesFileName, type SavedEntriesExport } from './buildExport';
import { formatSummary, summarizeExports } from './summary';

const DAY = Date.UTC(2026, 9, 5, 14, 30);
const row = (over: Partial<SensePickRow>): SensePickRow => ({
  key: 'k',
  bookKey: 'bk',
  lemmaKey: 'l1',
  providerId: 'aramorph',
  entryKey: 'e1',
  source: 'entry',
  word: 'كتبت',
  headword: 'كَتَبَ',
  verbForm: 'I',
  updatedAt: DAY,
  ...over,
});

describe('buildSavedEntriesExport', () => {
  const file = buildSavedEntriesExport(
    { title: 'الأيام', author: 'طه حسين' },
    'bk',
    [row({}), row({ entryKey: 'e2', headword: 'كَتَّبَ', verbForm: 'II', updatedAt: DAY + 1000 }), row({ lemmaKey: 'l0', word: 'أيام', entryKey: 'e9', headword: 'يَوْم', verbForm: undefined })],
    { now: DAY, appVersion: '0.31.0' },
  );

  it('groups saves by word and sorts them', () => {
    expect(file.words.map((w) => w.word)).toEqual(['أيام', 'كتبت']);
    expect(file.words[1].saves.map((s) => s.entryKey)).toEqual(['e1', 'e2']);
  });

  it('records the day only, never a time', () => {
    expect(file.words[1].saves[0].day).toBe('2026-10-05');
    expect(file.exportedAt).toBe('2026-10-05T14:30:00.000Z');
  });

  it('holds the book, the dictionary and the entry, and leaves out empty optional fields', () => {
    expect(file.format).toBe('arabic-reader-saved-entries');
    expect(file.book).toEqual({ title: 'الأيام', author: 'طه حسين', key: 'bk' });
    expect(file.words[0].saves[0]).toEqual({ dictionary: 'aramorph', entryKey: 'e9', headword: 'يَوْم', source: 'entry', day: '2026-10-05' });
  });

  it('carries nothing beyond what the panel says: no sentences, notes, cards or install id', () => {
    const text = JSON.stringify(file);
    for (const banned of ['sentence', 'note', 'meaning', 'installId', 'fsrs', 'updatedAt']) expect(text).not.toContain(banned);
  });

  it('an empty book gives an empty file', () => {
    expect(buildSavedEntriesExport({ title: 'x' }, 'bk', [], { now: DAY, appVersion: 't' }).words).toEqual([]);
  });
});

describe('savedEntriesFileName', () => {
  it('cleans the title and adds the day', () => {
    expect(savedEntriesFileName('الأيام: الجزء الأول!', DAY)).toBe('saved-entries-الأيام-الجزء-الأول-2026-10-05.json');
    expect(savedEntriesFileName('  ', DAY)).toBe('saved-entries-book-2026-10-05.json');
    expect(savedEntriesFileName('a'.repeat(100), DAY).length).toBeLessThanOrEqual(70);
  });
});

function reader(saves: Record<string, string[]>, title = 'الأيام'): SavedEntriesExport {
  return {
    format: 'arabic-reader-saved-entries',
    version: 1,
    exportedAt: 'x',
    appVersion: 't',
    book: { title, key: 'bk' },
    words: Object.entries(saves).map(([lemmaKey, entries]) => ({
      lemmaKey,
      word: lemmaKey,
      saves: entries.map((entryKey) => ({ dictionary: 'aramorph', entryKey, headword: entryKey, source: 'entry' as const, day: '2026-10-05' })),
    })),
  };
}

describe('summarizeExports', () => {
  it('counts readers per entry and says whether they agree', () => {
    const [book] = summarizeExports([reader({ w1: ['a'], w2: ['a'] }), reader({ w1: ['a'], w2: ['b'] }), reader({ w1: ['a'], w3: ['c'] })]);
    expect(book.files).toBe(3);
    const w1 = book.words.find((w) => w.lemmaKey === 'w1')!;
    expect(w1).toMatchObject({ readers: 3, agrees: true });
    expect(w1.entries[0]).toMatchObject({ entryKey: 'a', readers: 3, share: 1 });
    const w2 = book.words.find((w) => w.lemmaKey === 'w2')!;
    expect(w2).toMatchObject({ readers: 2, agrees: false });
    expect(book.comparable).toBe(2);
    expect(book.agreeing).toBe(1);
  });

  it('counts a reader once per entry even when they save it twice, and ignores words only one reader saved for agreement', () => {
    const [book] = summarizeExports([reader({ w: ['a', 'a'] }), reader({ x: ['b'] })]);
    expect(book.words.find((w) => w.lemmaKey === 'w')).toMatchObject({ readers: 1, agrees: false });
    expect(book.words.find((w) => w.lemmaKey === 'w')!.entries[0].readers).toBe(1);
    expect(book.comparable).toBe(0);
  });

  it('reports books separately', () => {
    const other = reader({ w: ['a'] }, 'كتاب آخر');
    other.book.key = 'other';
    expect(summarizeExports([reader({ w: ['a'] }), other]).map((b) => b.bookKey).sort()).toEqual(['bk', 'other']);
  });

  it('prints a readable report', () => {
    const text = formatSummary(summarizeExports([reader({ w1: ['a'] }), reader({ w1: ['a'] })]));
    expect(text).toContain('2 reader files');
    expect(text).toContain('Words two or more readers saved from: 1');
    expect(text).toContain('AGREE');
    expect(text).toContain('2/2');
  });
});
