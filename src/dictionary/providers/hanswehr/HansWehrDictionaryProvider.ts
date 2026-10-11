import type { DictionaryEntry } from '../../../types';
import { RootArticleProvider } from '../rootArticle/RootArticleProvider';
import { parseRootArticleTsv } from '../rootArticle/rootArticleData';

export const HANS_WEHR_MISSING_NOTE =
  "Hans Wehr isn't included with the app (it's under copyright). See public/hanswehr-data/SOURCE-README.md to add your own copy.";

/** True when the bundled file holds no entries (the committed placeholder is a single comment line). */
export function isEmptyHansWehr(tsv: string): boolean {
  return parseRootArticleTsv(tsv).byKey.size === 0;
}

/**
 * Optional Arabic-English dictionary: Hans Wehr, filed by root like Lane's. It is under copyright, so the
 * repository only holds an empty placeholder (public/hanswehr-data/SOURCE-README.md). While the data is empty,
 * every lookup returns one entry that explains this, so switching it on isn't silently blank; with a locally
 * generated copy it behaves like Lane's Lexicon.
 */
class HansWehrProvider extends RootArticleProvider {
  private empty: Promise<boolean> | null = null;

  private readonly source: () => Promise<string>;

  constructor(source: () => Promise<string>) {
    super('hanswehr', 'Hans Wehr (Arabic-English)', source);
    this.source = source;
  }

  override async lookup(word: string): Promise<DictionaryEntry[]> {
    this.empty ??= this.source().then(isEmptyHansWehr);
    if (await this.empty) {
      return [{ providerId: this.id, providerName: this.name, headword: word, senses: [{ gloss: HANS_WEHR_MISSING_NOTE }] }];
    }
    return super.lookup(word);
  }
}

export function createHansWehrProvider(source: () => Promise<string>): RootArticleProvider {
  return new HansWehrProvider(source);
}

export const hansWehrProvider = createHansWehrProvider(async () => (await import('virtual:hanswehr-data')).default);
