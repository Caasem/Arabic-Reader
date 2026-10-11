/**
 * The redesigned reader: the book as clean text on a quiet page, one dock at
 * the bottom (Contents, Search, Marks, Words | Display | Levels, Timer, Focus),
 * vocab levels in the margin beside the text, the usual dictionary popup, and
 * a book drawer for contents, search, bookmarks and highlights, and saved words.
 *
 * Since 0.96.0 it is the only reader (with a PDF's own pages beside it).
 * Touch points: ReaderSwitch (src/readerCore), which mounts <QuietReader>;
 * <QuietReaderSettings> in SettingsPanel; App (opening Settings at a group);
 * and savePopupEntries in useWordLookups (the popup's whole-section "+").
 * Bookmarks and highlights made here are stored with "clean:" locations in the
 * usual tables; ones from before 0.96.0 may hold epub CFIs, which
 * readerCore/epubPosition.ts places in the text.
 */
export { QuietReader } from './QuietReader';
export { QuietReaderSettings } from './QuietReaderSettings';
export { isCleanLocation } from '../readerCore/location';
