import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';
import { buildLookupKeys } from '../alwasit/lookupKeys';
import { findRows, parseRootArticleTsv, rowToEntry, type RootArticleData } from './rootArticleData';

/**
 * An optional Arabic-Arabic dictionary filed by root. Like Al-Wasit it can't
 * match the tapped surface form directly, so it reuses AraMorph's analysis
 * (already the app's MorphologyProvider) to resolve the word to its root and
 * dictionary form, then looks those up -- see alwasit/lookupKeys.ts for the
 * weak-letter spellings that makes work.
 *
 * `loadText` is a dynamic `import('virtual:...-data')`, so the multi-megabyte
 * data is its own chunk, parsed once and only the first time the dictionary is
 * actually used.
 */
export class RootArticleProvider implements DictionaryProvider {
  readonly id: string;
  readonly name: string;
  private readonly loadText: () => Promise<string>;
  private dataPromise: Promise<RootArticleData> | null = null;

  constructor(id: string, name: string, loadText: () => Promise<string>) {
    this.id = id;
    this.name = name;
    this.loadText = loadText;
  }

  private getData(): Promise<RootArticleData> {
    if (!this.dataPromise) this.dataPromise = this.loadText().then(parseRootArticleTsv);
    return this.dataPromise;
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const data = await this.getData();

    let analyses: Awaited<ReturnType<typeof aramorphProvider.analyze>> = [];
    try {
      analyses = await aramorphProvider.analyze(word);
    } catch {
      // AraMorph unavailable -- fall back to matching the raw surface form only.
    }
    return findRows(data, buildLookupKeys(word, analyses)).map((row) => rowToEntry(row, this));
  }
}
