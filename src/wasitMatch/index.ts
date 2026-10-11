/**
 * Colours the Al-Wasit sense that matches the looked-up word. The app wires its Settings section through
 * `wasitMatchFeature` in src/features/registry.ts; the other touch points are listed in it. To remove the feature,
 * delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import './wasitMatch.css';
import { WasitMatchSettings } from './WasitMatchSettings';

export const wasitMatchFeature: FeatureDescriptor = {
  id: 'wasitMatch',
  pref: 'wasitMatchHighlight',
  SettingsSection: WasitMatchSettings,
  settingsGroup: 'dictionary',
  touchPoints: [
    'the `wasitMatchHighlight` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '`findMatchedSenses` and `WASIT_MATCH_CLASS` in the dictionary popup (src/components/reader/DictionaryPopup.tsx)',
  ],
};

export { findMatchedSenses } from './matchSenses';
export const WASIT_MATCH_CLASS = 'wasit-match';
