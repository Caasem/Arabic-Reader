/**
 * Press Alt+N while reading to write a note on the selected text (a highlight
 * with a note), in a floating card that stays out of the way. Self-contained
 * beside src/readerChords and src/floatingCard: the app touches this folder in
 * four places only — <NoteHost> mounted in ReaderSwitch, <NoteSettings> in
 * SettingsPanel, the `noteCardEnabled` preference (types + defaults), and the
 * readers' registerReaderMarks calls (src/readerChords). To remove the
 * feature, delete this folder and those references.
 */
export { NoteHost } from './NoteHost';
export { NoteSettings } from './NoteSettings';
