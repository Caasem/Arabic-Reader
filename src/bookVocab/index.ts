/**
 * Press Alt+V while reading to open a drawer listing every word saved from the current book (filter by status or due,
 * tap a row to see its sentence and jump back to it). The app wires it through `bookVocabFeature` in
 * src/features/registry.ts; the other touch points are listed in it. To remove the feature, delete this folder, its
 * registry line and those touch points (src/readerChords is shared with bookSearch).
 */
import type { FeatureDescriptor } from '../features/registry';
import { BookVocabHost } from './BookVocabHost';
import { BookVocabSettings } from './BookVocabSettings';

export const bookVocabFeature: FeatureDescriptor = {
  id: 'bookVocab',
  pref: 'bookVocabEnabled',
  Host: BookVocabHost,
  SettingsSection: BookVocabSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+V'],
  touchPoints: [
    'the `bookVocabEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the reader's registerBookNavigator call, which lets a row jump back to its place (src/quietReader/QuietReader.tsx, src/readerChords)",
  ],
};
