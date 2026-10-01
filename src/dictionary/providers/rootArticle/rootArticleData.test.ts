import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLookupKeys } from '../alwasit/lookupKeys';
import { findRows, parseRootArticleTsv, rowToEntry } from './rootArticleData';

const provider = { id: 'x', name: 'X' };

describe('parseRootArticleTsv / findRows', () => {
  const data = parseRootArticleTsv('وفى\tالوفاء: ضد الغدر.<br>واستوفى حقه.\nأبا\tالأبوة.\n\nbad line without a tab\n');

  it('indexes rows by their vowel-stripped root', () => {
    expect(findRows(data, ['وفى']).map((r) => r.word)).toEqual(['وفى']);
  });

  it('skips blank and tab-less lines', () => {
    expect(data.byKey.size).toBe(2);
  });

  it('falls back to the alef/hamza-folded index only when nothing matches exactly', () => {
    expect(findRows(data, ['ابا']).map((r) => r.word)).toEqual(['أبا']);
    expect(findRows(data, ['وفى', 'ابا']).map((r) => r.word)).toEqual(['وفى']);
  });

  it('returns nothing for an unknown root', () => {
    expect(findRows(data, ['ضرب'])).toEqual([]);
  });
});

describe('rowToEntry', () => {
  it('turns each <br> unit into a sense, dropping empties', () => {
    const entry = rowToEntry({ id: 0, word: 'وفى', meanings: 'أ<br> ب <br><br>ج' }, provider);
    expect(entry.senses.map((s) => s.gloss)).toEqual(['أ', 'ب', 'ج']);
    expect(entry.headword).toBe('وفى');
    expect(entry.root).toBe('وفى');
    expect(entry.providerId).toBe('x');
  });
});

/** The real bundled data, read straight from public/ (the vitest alias stubs the virtual modules out). */
function loadDataset(file: string) {
  const raw = fs.readFileSync(path.join(__dirname, '../../../../public', file), 'utf8');
  return { raw, data: parseRootArticleTsv(raw) };
}

describe('bundled Al-Ṣiḥāḥ data', () => {
  const { raw, data } = loadDataset('alsihah-data/alsihah.tsv');

  it('is well formed: one tab per line, no leftover source markup', () => {
    const lines = raw.split('\n').filter(Boolean);
    expect(lines.length).toBe(5650);
    expect(lines.every((l) => l.split('\t').length === 2)).toBe(true);
    expect(raw).not.toContain('[[');
    expect(raw).not.toContain('|');
  });

  it("finds the root of استوفى under the dictionary's own spelling", () => {
    // AraMorph reads استوفى as root وفي; Al-Ṣiḥāḥ files it under وفى.
    const rows = findRows(data, buildLookupKeys('استوفى', [{ root: 'وفي', lemma: 'اسْتَوْفَى' }]));
    expect(rows.map((r) => r.word)).toEqual(['وفى']);
    const senses = rowToEntry(rows[0], provider).senses.map((s) => s.gloss);
    expect(senses.some((g) => g.startsWith('واسْتَوْفى حقّه'))).toBe(true);
  });

  it('keeps the editor\'s notes as numbered trailing lines, never split mid-note', () => {
    const [row] = findRows(data, ['وفى']);
    const senses = rowToEntry(row, provider).senses.map((s) => s.gloss);
    expect(senses.filter((g) => /^\([٠-٩]+\) /.test(g)).length).toBe(2);
    expect(senses.slice(-2).every((g) => /^\([٠-٩]+\) /.test(g))).toBe(true);
  });

  it('has an article for the roots of the other test words', () => {
    for (const root of ['خرج', 'علم', 'كتب', 'غفر']) expect(findRows(data, [root]).length, root).toBe(1);
  });
});

describe('bundled Maqāyīs data', () => {
  const { raw, data } = loadDataset('almaqayis-data/almaqayis.tsv');

  it('is well formed', () => {
    const lines = raw.split('\n').filter(Boolean);
    expect(lines.length).toBe(5274);
    expect(lines.every((l) => l.split('\t').length === 2)).toBe(true);
    expect(raw).not.toContain('|');
  });

  it('opens every article with its root in parentheses', () => {
    const lines = raw.split('\n').filter(Boolean);
    expect(lines.every((l) => l.split('\t')[1].startsWith('('))).toBe(true);
  });

  it('finds the root article for استوفى, which mentions it only in running text', () => {
    const rows = findRows(data, buildLookupKeys('استوفى', [{ root: 'وفي', lemma: 'اسْتَوْفَى' }]));
    expect(rows.map((r) => r.word)).toEqual(['وفى']);
    expect(rows[0].meanings).toContain('وَاسْتَوْفَيْتُهُ');
  });
});
