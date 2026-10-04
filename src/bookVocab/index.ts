/**
 * Press Alt+V while reading to open a drawer listing every word saved from the
 * current book (filter by status or due, tap a row to see its sentence and
 * jump back to it). Self-contained: the app touches this folder in four places
 * only — <BookVocabHost> mounted in ReaderSwitch, <BookVocabSettings> in
 * SettingsPanel, and the `bookVocabEnabled` preference (types + defaults).
 * To remove the feature, delete this folder and those references
 * (src/readerChords is shared with bookSearch).
 */
export { BookVocabHost } from './BookVocabHost';
export { BookVocabSettings } from './BookVocabSettings';
