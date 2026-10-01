import { RootArticleProvider } from '../rootArticle/RootArticleProvider';

/**
 * Optional second classical Arabic-Arabic dictionary: Al-Ṣiḥāḥ (الجوهري, d. ~1002),
 * from the arabic_lexicons project -- see public/alsihah-data/SOURCE-README.md.
 * Off by default; loaded only on first use.
 */
export const alSihahProvider = new RootArticleProvider(
  'alsihah',
  'Al-Ṣiḥāḥ (Arabic-Arabic)',
  () => import('virtual:alsihah-data').then((mod) => mod.default),
);
