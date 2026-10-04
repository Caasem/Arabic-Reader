import { RootArticleProvider } from '../rootArticle/RootArticleProvider';

/**
 * Optional classical Arabic-Arabic dictionary: Maqāyīs al-Lugha (ابن فارس, d. ~1004),
 * from the arabic_lexicons project -- see public/almaqayis-data/SOURCE-README.md.
 * It explains each root's core meaning(s) rather than listing derived words,
 * so an entry is one short article per root. Off by default; loaded only on first use.
 */
export const alMaqayisProvider = new RootArticleProvider(
  'almaqayis',
  'Maqāyīs al-Lugha (Arabic-Arabic)',
  () => import('virtual:almaqayis-data').then((mod) => mod.default),
);
