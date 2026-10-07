import { installedPackText } from '../../../packManager';
import { RootArticleProvider } from '../rootArticle/RootArticleProvider';

/**
 * Optional second classical Arabic-Arabic dictionary: Al-Ṣiḥāḥ (الجوهري, d. ~1002),
 * from the arabic_lexicons project -- see public/alsihah-data/SOURCE-README.md.
 * Off by default; loaded only on first use. Reads its data from the downloaded pack when one is installed
 * (src/packManager), else from the copy bundled with the app, which stays as the fallback.
 */
export const alSihahProvider = new RootArticleProvider(
  'alsihah',
  'Al-Ṣiḥāḥ (Arabic-Arabic)',
  async () => (await installedPackText('alsihah', 'alsihah.tsv')) ?? (await import('virtual:alsihah-data')).default,
);
