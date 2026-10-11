import { RootArticleProvider } from '../rootArticle/RootArticleProvider';

/**
 * Optional Arabic-English dictionary: Lane's Lexicon (1863-93, public domain), filed by root, from the
 * arabic_lexicons project -- see public/lane-data/SOURCE-README.md. Off by default; loaded only on first use
 * from the copy bundled with the app (its own chunk, never precached).
 */
export const laneProvider = new RootArticleProvider(
  'lane',
  "Lane's Lexicon (Arabic-English)",
  async () => (await import('virtual:lane-data')).default,
);
