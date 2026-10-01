/**
 * Press Alt+S in the epub reader to search the whole book from a palette:
 * "Same root" finds every form of a word (using the dictionary's root for each
 * word in the book), "Exact text" finds that spelling. Enter jumps to the match.
 * Self-contained: the app touches this folder in five places only —
 * <BookSearchHost> mounted in ReaderSwitch, <BookSearchSettings> in SettingsPanel,
 * the `bookSearchEnabled` preference (types + defaults), and one
 * registerBookNavigator() call in Reader.tsx. To remove the feature, delete
 * this folder and those references (src/readerChords is shared with bookVocab).
 */
export { BookSearchHost } from './BookSearchHost';
export { BookSearchSettings } from './BookSearchSettings';
