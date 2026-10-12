import { RootArticleProvider } from '../rootArticle/RootArticleProvider';

/**
 * Optional second Arabic-Arabic dictionary: Al-Muʿjam al-Wasīṭ, sourced from
 * the arabic_lexicons project (see public/alwasit-data/SOURCE-README.md for
 * provenance/licensing notes -- unlike this app's other sources, its status
 * isn't clean-cut public domain, which is why this provider defaults to off
 * and is only ever loaded on demand).
 *
 * Al-Wasit is keyed by root, not surface form (same as the classical
 * dictionaries it draws structure from), so it can't normalize-and-match the
 * tapped word directly: like the other root-filed dictionaries it reuses AraMorph's
 * morphological analysis to resolve the surface form to its root/lemma first, then
 * looks *that* up (see RootArticleProvider and lookupKeys.ts, including the
 * sub-entry fallback for a word AraMorph gives no root for). Its rows have the
 * same shape as theirs (a headword field that may list homographs as "همز|همزة",
 * `<br>`-separated sub-entries); each lead form "(كَتَبَ) ..." with the
 * continuations "و- ..." after it becomes an entry of its own (see articleEntries).
 *
 * The ~7.8MB dataset is its own chunk, parsed once and only the first time the
 * provider is actually used -- see the dynamic import below and its
 * vite.config.ts counterpart for why this must not happen at module load.
 */
export const alWasitProvider = new RootArticleProvider(
  'alwasit',
  'Al-Muʿjam al-Wasīṭ (Arabic-Arabic)',
  () => import('virtual:alwasit-data').then((mod) => mod.default),
);
