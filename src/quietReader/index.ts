/**
 * The redesigned reader: the book as clean text on a quiet page, one dock at
 * the bottom (Contents, Search, Marks, Words | Display | Levels, Timer, Focus),
 * vocab levels in the margin beside the text, the usual dictionary popup, and
 * a book drawer for contents, search, bookmarks and highlights, and saved words.
 *
 * Touch points: ReaderSwitch (which mounts <QuietReader> when the
 * `quietReaderEnabled` preference is on, and the epub reader for a book whose
 * Display -> View is "Original layout"), <QuietReaderSettings> in
 * SettingsPanel, App (opening Settings at a group), the clean-location guards
 * in the epub reader (location.ts's isCleanLocation), and savePopupEntries in
 * useWordLookups (the popup's whole-section "+"). Bookmarks and highlights
 * made here are stored with "clean:" locations in the usual tables. To go
 * back: switch "New reader" off in Settings, or `git revert` the commit that
 * added it.
 */
export { QuietReader } from './QuietReader';
export { QuietReaderSettings } from './QuietReaderSettings';
export { useReaderView } from './readerView';
export { isCleanLocation } from './location';
