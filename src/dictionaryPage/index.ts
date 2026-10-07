/**
 * The full-page dictionary: one word's entries with room to read, a tab per dictionary, nearby
 * headwords for dictionaries filed in order, search and history, and saving with or without a
 * book open (cards saved with no book are filed under "Dictionary").
 *
 * Touch points: the "dictionary" view and its nav item (App.tsx, NavBar.tsx); the popup's
 * maximise button and F key (`onMaximise` on DictionaryPopup, passed by each reader); Alt+D's
 * "Full page" button (src/dictionarySearch/SearchBody.tsx); `listHeadwords` on root-filed providers
 * (src/dictionary/headwords.ts); and the `dictionaryFullPageEnabled` preference (Settings →
 * Dictionary). To remove: delete this folder and those references; the popup's `page` mode can stay.
 */
export { DictionaryPage } from './DictionaryPage';
export { openDictionaryPage, onOpenDictionaryPage, type DictionaryPageRequest } from './events';
