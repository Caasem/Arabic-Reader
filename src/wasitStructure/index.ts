/**
 * Draws Al-Wasit's internal structure (forms, continuations, headword line,
 * plurals, register tags, examples) over the popup's word tokens. Purely
 * presentational: text, tokens and word-selection are untouched. Self-
 * contained: the app touches this folder in three places only --
 * `annotateEntry` in DictionaryPopup, <WasitStructureSettings> in
 * SettingsPanel, and the `wasitStructure*` preferences. To remove the
 * feature, delete the folder and those three references.
 */
import './wasitStructure.css';

export { annotateEntry, type SenseAnnotation, type WordAnnotation } from './parse';
export { WasitStructureSettings } from './WasitStructureSettings';
