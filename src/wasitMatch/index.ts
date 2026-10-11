/**
 * Lands on the looked-up word in a root dictionary's article: colours the sub-entry that matches it
 * (Al-Wasīṭ, Al-Ṣiḥāḥ, Maqāyīs, Lane, Hans Wehr) and scrolls the popup to it. The matching itself lives in
 * src/dictionary/subEntries. The app wires its Settings section through `wasitMatchFeature` in
 * src/features/registry.ts; the other touch points are listed in it. To remove the feature, delete this
 * folder, its registry line and those touch points.
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
    'the `wasitMatchHighlight` and `subEntryScroll` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '`findMatchedSenses` and `scrollToFirstMatches` in the dictionary popup (src/components/reader/DictionaryPopup.tsx)',
    '`WASIT_MATCH_CLASS`, `SUB_ENTRY_MATCH_ATTR` and `matchedHead` in its entry list (src/components/reader/dictionaryPopup/entryList.tsx)',
  ],
};

export { findMatchedSenses } from '../dictionary/subEntries/match';
export { SUB_ENTRY_MATCH_ATTR, scrollToFirstMatches } from './scrollToMatch';
export { matchedHead } from '../dictionary/subEntries/heads';
export const WASIT_MATCH_CLASS = 'wasit-match';
