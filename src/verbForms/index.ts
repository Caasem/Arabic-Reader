/**
 * Verb forms (I-X) in the dictionary: for a verb the popup shows its form, its imperfect vowel (Form I) and, on
 * request, the other verbs the dictionary lists for the same root. The form is read off the AraMorph lemma's spelling
 * (classifyForm.ts); nothing is invented.
 *
 * The app wires its Settings section through `verbFormsFeature` in src/features/registry.ts; the other touch points
 * are listed in it. To remove the feature, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { VerbFormsSettings } from './VerbFormsSettings';
import './verbForms.css';

export const verbFormsFeature: FeatureDescriptor = {
  id: 'verbForms',
  pref: 'verbFormsEnabled',
  SettingsSection: VerbFormsSettings,
  settingsGroup: 'dictionary',
  touchPoints: [
    'the `verbFormsEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '<VerbFormMark> and <VerbFormInfo> in the dictionary popup (src/components/reader/DictionaryPopup.tsx)',
    "the data path that carries the form out of the AraMorph dictionary: classifyVerbForm, verbFormOf and verbFamily in the engine, the worker's 'verbFamily' message, AramorphDictionaryProvider.verbFamily (src/dictionary/providers/aramorph) and the `verbForm` / `imperfectVowel` fields (src/types/dictionary.ts)",
  ],
};

export { VerbFormInfo, VerbFormMark } from './VerbFormInfo';
export { classifyVerbForm, type VerbForm } from './classifyForm';
