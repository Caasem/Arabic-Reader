/**
 * Press Alt+F while reading to write a flashcard of your own (a saved word with a hand-written back), in a floating
 * card that stays out of the way. Self-contained beside src/readerChords and src/floatingCard. The app wires it
 * through `flashCardFeature` in src/features/registry.ts; the other touch points are listed in it. To remove the
 * feature, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { FlashHost } from './FlashHost';
import { FlashSettings } from './FlashSettings';

export const flashCardFeature: FeatureDescriptor = {
  id: 'flashCard',
  pref: 'flashCardEnabled',
  Host: FlashHost,
  SettingsSection: FlashSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+F'],
  touchPoints: [
    'the `flashCardEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '`saveCustomCard` in the vocabulary service and the `custom` flag on a vocabulary item (src/vocabulary/vocabularyService.ts, src/types/vocabulary.ts), also read by the Anki note type (src/anki/noteType.ts) and used by the study desk margins (src/studyDesk/MarginLayer.tsx)',
  ],
};
