import { describe, expect, it, vi } from 'vitest';
import { RootArticleProvider } from '../rootArticle/RootArticleProvider';
import { createHansWehrProvider, HANS_WEHR_MISSING_NOTE, isEmptyHansWehr } from './HansWehrDictionaryProvider';
import fs from 'node:fs';
import path from 'node:path';

// AraMorph needs a Worker; with no analyses the providers fall back to the raw surface form.
vi.mock('../aramorph/AramorphDictionaryProvider', () => ({ aramorphProvider: { analyze: async () => [] } }));

const FIXTURE = 'حسد\tحَسَدٌ Envy; the wishing that a blessing may depart.<br>He envied him.\nكتب\tTo write.\n';

describe("Lane's Lexicon provider shape", () => {
  it('finds a root article from a TSV and cuts it into one entry per line', async () => {
    const lane = new RootArticleProvider('lane', "Lane's Lexicon (Arabic-English)", async () => FIXTURE);
    const entries = await lane.lookup('حسد');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.providerId)).toEqual(['lane', 'lane']);
    expect(entries.map((e) => e.senses[0].gloss)).toEqual(['حَسَدٌ Envy; the wishing that a blessing may depart.', 'He envied him.']);
    expect(entries.map((e) => e.headword)).toEqual(['حَسَدٌ', 'حسد']);
    expect(entries.every((e) => e.root === 'حسد' && e.articleKey === entries[0].articleKey)).toBe(true);
  });
});

describe('Hans Wehr provider', () => {
  it('returns one explanatory entry when its data is empty', async () => {
    const hw = createHansWehrProvider(async () => '# placeholder\n');
    const entries = await hw.lookup('حسد');
    expect(entries).toHaveLength(1);
    expect(entries[0].providerId).toBe('hanswehr');
    expect(entries[0].senses).toEqual([{ gloss: HANS_WEHR_MISSING_NOTE }]);
  });

  it('behaves like Lane when data is present', async () => {
    const hw = createHansWehrProvider(async () => FIXTURE);
    const entries = await hw.lookup('كتب');
    expect(entries.map((e) => e.senses[0].gloss)).toEqual(['To write.']);
  });

  it('the committed placeholder holds no entries', () => {
    const tsv = fs.readFileSync(path.resolve(__dirname, '../../../../public/hanswehr-data/hanswehr.tsv'), 'utf8');
    expect(isEmptyHansWehr(tsv)).toBe(true);
  });
});
