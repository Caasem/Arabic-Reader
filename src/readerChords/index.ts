/**
 * Small shared helpers for Alt+<key> reader shortcuts (Alt+S book search,
 * Alt+V book vocabulary, Alt+N note, Alt+F flashcard): the hotkey hook, a
 * bridge that lets those features ask the open epub reader to jump somewhere
 * without importing it, and a bridge through which the note and flashcard
 * cards read the reader's selection and add highlights.
 * Used only by src/bookSearch, src/bookVocab, src/noteCard and src/flashCard; delete with them.
 */
export { useChordHotkey } from './useChordHotkey';
export { goToBookLocation, registerBookNavigator, type LocationHint } from './navigation';
export {
  announceReaderSelection,
  getReaderMarks,
  registerReaderMarks,
  sentenceAt,
  sentenceSpan,
  subscribeReaderSelection,
  type MarkCapture,
  type ReaderMarks,
} from './readerMarks';
