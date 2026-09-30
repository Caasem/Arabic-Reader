/**
 * Press D in either reader to search the dictionary. Self-contained: the app
 * touches this folder in three places only — <DictionarySearchHost> mounted in
 * ReaderSwitch, <DictionarySearchSettings> in SettingsPanel, and the
 * `dictionarySearch*` preferences. To remove the feature, delete the folder
 * and those three references.
 */
export { DictionarySearchHost } from './DictionarySearchHost';
export { DictionarySearchSettings } from './DictionarySearchSettings';
