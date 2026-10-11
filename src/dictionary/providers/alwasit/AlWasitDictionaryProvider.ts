import type { DictionaryEntry, DictionaryProvider } from '../../../types';
import { headwordWindow } from '../../headwords';
import { aramorphProvider } from '../aramorph/AramorphDictionaryProvider';
import { findArticles, parseRootArticleTsv, type RootArticleData } from '../rootArticle/rootArticleData';

/**
 * Optional second Arabic-Arabic dictionary: Al-Muʿjam al-Wasīṭ, sourced from
 * the arabic_lexicons project (see public/alwasit-data/SOURCE-README.md for
 * provenance/licensing notes -- unlike this app's other sources, its status
 * isn't clean-cut public domain, which is why this provider defaults to off
 * and is only ever loaded on demand).
 *
 * Al-Wasit is keyed by root, not surface form (same as the classical
 * dictionaries it draws structure from), so unlike the mock providers this
 * one can't just normalize-and-match the tapped word directly -- it reuses
 * AraMorph's own morphological analysis (already registered as the app's
 * MorphologyProvider) to resolve the surface form to its root/lemma first,
 * then looks *that* up. Its rows have the same shape as the other root-filed
 * dictionaries' (a headword field that may list homographs as "همز|همزة",
 * `<br>`-separated sub-entries), so it shares their parsing and lookup in
 * rootArticleData.ts, including the sub-entry fallback for a word AraMorph
 * gives no root for.
 */
export class AlWasitDictionaryProvider implements DictionaryProvider {
  id = 'alwasit';
  name = 'Al-Muʿjam al-Wasīṭ (Arabic-Arabic)';

  private dataPromise: Promise<RootArticleData> | null = null;

  /** Parses the ~7.8MB dataset only once, and only the first time this
   * provider is actually used -- see the dynamic import below and its
   * vite.config.ts counterpart for why this must not happen at module load. */
  private async getData(): Promise<RootArticleData> {
    if (!this.dataPromise) {
      this.dataPromise = import('virtual:alwasit-data').then((mod) => parseRootArticleTsv(mod.default));
    }
    return this.dataPromise;
  }

  async listHeadwords(around: string, before: number, after: number) {
    return headwordWindow((await this.getData()).byKey, around, before, after);
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    const data = await this.getData();

    // The word, AraMorph's roots and dictionary forms for it, and the weak-letter
    // spellings of those roots (see lookupKeys.ts): AraMorph's قري is Al-Wasit's "قرا|قرو".
    let analyses: Awaited<ReturnType<typeof aramorphProvider.analyze>> = [];
    try {
      analyses = await aramorphProvider.analyze(word);
    } catch {
      // AraMorph unavailable -- fall back to matching the raw surface form only.
    }

    return findArticles(data, this.id, word, analyses).map((row) => {
      const headword = row.word.split('|')[0].trim();
      return {
        providerId: this.id,
        providerName: this.name,
        headword,
        root: headword,
        // Al-Wasit's own meanings field already separates senses with <br>,
        // but a single <br> block can still run several sub-senses together
        // as one long paragraph, each introduced by its own "و-" marker
        // (classical dictionary notation for "and also:") -- e.g. "تحَرّكَ.
        // و- القلبُ: نَبَضَ. و- العِرْقُ: هاجَ..." is three sub-senses under
        // one <br> block. Splitting on that marker too (kept, not
        // stripped, to stay faithful to the source text) turns one long
        // run-on block into several short list items, same as if the
        // source data had used <br> between them in the first place.
        senses: row.meanings
          .split(/<br\s*\/?>/i)
          .flatMap((block) => block.split(/(?=\sو-\s)/))
          .map((s) => s.trim())
          .filter(Boolean)
          .map((gloss) => ({ gloss })),
      };
    });
  }
}

export const alWasitProvider = new AlWasitDictionaryProvider();
