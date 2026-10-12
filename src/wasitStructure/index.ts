/**
 * Draws Al-Wasit's internal structure (forms, continuations, headword line, plurals, register tags, examples) over
 * the popup's word tokens. Purely presentational: text, tokens and word-selection are untouched. The app wires its
 * Settings section through `wasitStructureFeature` in src/features/registry.ts; the other touch points are listed in
 * it. To remove the feature, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import './wasitStructure.css';
import { WasitStructureSettings } from './WasitStructureSettings';

export const wasitStructureFeature: FeatureDescriptor = {
  id: 'wasitStructure',
  pref: 'wasitStructureEnabled',
  SettingsSection: WasitStructureSettings,
  settingsGroup: 'dictionary',
  touchPoints: [
    'the `wasitStructureEnabled` and `wasitStructureExamples` `wasitLabelsEnabled` and `sihahVerseLayout` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '`annotateEntry` in the dictionary popup (src/components/reader/DictionaryPopup.tsx)',
    '`findVerses` and `verseNodes` in its entry list (src/components/reader/dictionaryPopup/entryList.tsx; src/dictionary/senseFormat/sihahVerses.ts)',
  ],
};

export { annotateEntry, type SenseAnnotation, type WordAnnotation } from './parse';
