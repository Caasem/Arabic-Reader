import { describe, expect, it } from 'vitest';
import { findArticles, parseRootArticleTsv } from '../providers/rootArticle/rootArticleData';
import { buildSubEntryIndex, findRowsBySubEntry, MAX_FALLBACK_ROOTS, orderBySubEntry } from './subEntryIndex';

const LANE = [
  'ادم\tأَدَمَ الخُبْزَ 1 He mixed the bread with seasoning.<br>إِدَامٌ Seasoning; anything eaten with bread.<br>أَرْضٌ بَصِرَةٌ Land of stones.',
  'قرط\tقُرْطٌ An ear-ring.<br>قِيرَاطٌ A carat.',
  'تبن\tتِبْنٌ Straw.<br>مَتْبَنٌ A place for straw.',
  'بصر\tبَصُرَ 1 He saw.<br>بَصِيرٌ Seeing.',
  // A headword filed under three roots: too ambiguous to pick an article by.
  'سلم\tسَلَمٌ A kind of tree.<br>كَلَامٌ Speech.',
  'كلم\tكَلَامٌ Speech.',
  'قول\tكَلَامٌ Speech, said.',
].join('\n');

describe('buildSubEntryIndex', () => {
  const data = parseRootArticleTsv(LANE);
  const index = buildSubEntryIndex(data, 'lane');

  it("keys every headword built on its article's root", () => {
    expect(index.has('ادام')).toBe(true);
    expect(index.has('قيراط')).toBe(true);
    expect(index.has('متبن')).toBe(true);
  });

  it('leaves out headwords not built on the root (example phrases, strays)', () => {
    // أرض under أدم and كلام under سلم/قول do not hold those roots' letters.
    expect(index.has('ارض')).toBe(false);
    expect(index.get('كلام')).toHaveLength(1);
  });

  it('builds nothing for a dictionary without sub-entries (Maqāyīs)', () => {
    expect(buildSubEntryIndex(data, 'almaqayis').size).toBe(0);
  });
});

describe('findRowsBySubEntry: the rootless fallback', () => {
  const data = parseRootArticleTsv(LANE);
  const words = (word: string, analyses = [{ lemma: word }]) => findRowsBySubEntry(data, 'lane', word, analyses).map((r) => r.word);

  it('finds the article a rootless noun is filed under', () => {
    expect(words('إدام')).toEqual(['ادم']);
    expect(words('قيراط')).toEqual(['قرط']);
    expect(words('متبن')).toEqual(['تبن']);
  });

  it('uses the lemma of an inflected word', () => {
    expect(words('بالإدام', [{ lemma: 'إِدام' }])).toEqual(['ادم']);
  });

  it('strips clitics by hand only when AraMorph does not know the word', () => {
    expect(findRowsBySubEntry(data, 'lane', 'وقيراط', []).map((r) => r.word)).toEqual(['قرط']);
    expect(findRowsBySubEntry(data, 'lane', 'والإدام', []).map((r) => r.word)).toEqual(['ادم']);
  });

  it('never looks up a function word', () => {
    expect(findRowsBySubEntry(data, 'lane', 'إدام', [{ lemma: 'إِدام', pos: 'li>an~a/CONJ' }])).toEqual([]);
  });

  it('skips a headword filed under too many roots', () => {
    const many = parseRootArticleTsv(['سلم\tسَلَامٌ Peace.', 'سلو\tسَلَامٌ Peace.', 'سول\tسَلَامٌ Peace.'].join('\n'));
    expect(MAX_FALLBACK_ROOTS).toBe(2);
    expect(findRowsBySubEntry(many, 'lane', 'سلام', [{ lemma: 'سَلام' }])).toEqual([]);
  });

  it('finds nothing in a dictionary without an index', () => {
    expect(findRowsBySubEntry(data, 'almaqayis', 'إدام', [{ lemma: 'إِدام' }])).toEqual([]);
  });
});

describe('findArticles', () => {
  const data = parseRootArticleTsv(LANE);

  it('prefers the root articles and falls back to the index only when none is found', () => {
    expect(findArticles(data, 'lane', 'بصير', [{ lemma: 'بَصِير', root: 'بصر' }]).map((r) => r.word)).toEqual(['بصر']);
    expect(findArticles(data, 'lane', 'إدام', [{ lemma: 'إِدام' }]).map((r) => r.word)).toEqual(['ادم']);
    expect(findArticles(data, 'lane', 'شجرة', [{ lemma: 'شَجَرَة' }])).toEqual([]);
  });
});

describe('orderBySubEntry', () => {
  const data = parseRootArticleTsv(LANE);
  const rows = (...roots: string[]) => roots.map((r) => data.byKey.get(r)![0]);

  it('moves the article holding the word itself ahead of one found by root alone', () => {
    const ordered = orderBySubEntry(rows('بصر', 'تبن'), 'lane', 'متبن', [{ lemma: 'مَتْبَن', root: 'تبن' }]);
    expect(ordered.map((r) => r.word)).toEqual(['تبن', 'بصر']);
  });

  it('keeps the order when every article (or none) holds the word', () => {
    expect(orderBySubEntry(rows('بصر', 'تبن'), 'lane', 'شجر', []).map((r) => r.word)).toEqual(['بصر', 'تبن']);
    expect(orderBySubEntry(rows('بصر'), 'lane', 'متبن', []).map((r) => r.word)).toEqual(['بصر']);
  });
});
