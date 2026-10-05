/**
 * Press Alt+F while reading to write a flashcard of your own (a saved word with
 * a hand-written back), in a floating card that stays out of the way.
 * Self-contained beside src/readerChords and src/floatingCard: the app touches
 * this folder in four places only — <FlashHost> mounted in ReaderSwitch,
 * <FlashSettings> in SettingsPanel, the `flashCardEnabled` preference (types +
 * defaults), and `saveCustomCard` / `custom` in the vocabulary service and
 * type. To remove the feature, delete this folder and those references.
 */
export { FlashHost } from './FlashHost';
export { FlashSettings } from './FlashSettings';
