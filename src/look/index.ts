/**
 * The redesign ("Ink" look), self-contained. Everything visual lives in look.css under `html[data-look]`, so turning
 * the look off in Settings (or deleting this folder and its touch points) restores the original design. The app wires
 * it through `lookFeature` in src/features/registry.ts; the other touch points are listed in it.
 */
import type { FeatureDescriptor } from '../features/registry';
import './look.css';
import { LookSettings } from './LookSettings';
import { LookSkin } from './LookSkin';

export const lookFeature: FeatureDescriptor = {
  id: 'look',
  pref: 'lookEnabled',
  AppHost: LookSkin,
  SettingsSection: LookSettings,
  settingsGroup: 'appearance',
  touchPoints: [
    'the `lookEnabled`, `lookPalette` and `lookCustom` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'the `data-mastery` attribute on vocabulary cards, which look.css styles (src/components/vocabulary/VocabularyList.tsx)',
    "the library's use of continueBook: pickContinueBook and FINISHED_AT (src/components/library/Library.tsx, src/components/library/libraryInsights.ts)",
  ],
};
