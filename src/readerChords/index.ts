/**
 * Small shared helpers for Alt+<key> reader shortcuts (Alt+S book search,
 * Alt+V book vocabulary): the hotkey hook, and a bridge that lets those
 * features ask the open epub reader to jump somewhere without importing it.
 * Used only by src/bookSearch and src/bookVocab; delete with them.
 */
export { useChordHotkey } from './useChordHotkey';
export { goToBookLocation, registerBookNavigator, type LocationHint } from './navigation';
