/**
 * Press Alt+D in either reader to search the dictionary. The app wires it through `dictionarySearchFeature` in
 * src/features/registry.ts; the other touch points are listed in it. To remove the feature, delete this folder, its
 * registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { DictionarySearchHost } from './DictionarySearchHost';
import { DictionarySearchSettings } from './DictionarySearchSettings';

export const dictionarySearchFeature: FeatureDescriptor = {
  id: 'dictionarySearch',
  pref: 'dictionarySearchEnabled',
  Host: DictionarySearchHost,
  SettingsSection: DictionarySearchSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+D'],
  touchPoints: [
    'the `dictionarySearchEnabled` and `dictionarySearchStyle` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the study desk's inbox and pull-in, which reuse its Shell frame and stylesheet (src/studyDesk/DeskHost.tsx)",
  ],
};
