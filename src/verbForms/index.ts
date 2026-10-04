/**
 * Verb forms (I-X) in the dictionary: for a verb the popup shows its form, its
 * imperfect vowel (Form I) and, on request, the other verbs the dictionary
 * lists for the same root. The form is read off the AraMorph lemma's spelling
 * (classifyForm.ts); nothing is invented.
 *
 * The app touches this folder in these places: <VerbFormMark> and <VerbFormInfo> in
 * DictionaryPopup, <VerbFormsSettings> in SettingsPanel, the
 * `verbFormsEnabled` preference, and a data path that carries the form out of
 * the Arabic Dictionary engine (engine.ts verbFormOf/verbFamily, the worker's
 * 'verbFamily' message, AramorphDictionaryProvider.verbFamily, and the
 * `verbForm`/`imperfectVowel` fields in types/dictionary.ts). To remove the
 * feature, `git revert` the commit that added it.
 */
export { VerbFormInfo, VerbFormMark } from './VerbFormInfo';
export { VerbFormsSettings } from './VerbFormsSettings';
export { classifyVerbForm, type VerbForm } from './classifyForm';
import './verbForms.css';
