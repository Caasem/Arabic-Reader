/**
 * Press Alt+N while reading to write a note on the selected text (a highlight with a note), in a floating card that
 * stays out of the way. Self-contained beside src/readerChords and src/floatingCard. The app wires it through
 * `noteCardFeature` in src/features/registry.ts; the other touch points are listed in it. To remove the feature,
 * delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { NoteHost } from './NoteHost';
import { NoteSettings } from './NoteSettings';

export const noteCardFeature: FeatureDescriptor = {
  id: 'noteCard',
  pref: 'noteCardEnabled',
  Host: NoteHost,
  SettingsSection: NoteSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+N'],
  touchPoints: [
    'the `noteCardEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the readers' registerReaderMarks calls, which let the card add a highlight (src/readerChords)",
  ],
};
