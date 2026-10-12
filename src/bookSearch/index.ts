/**
 * Press Alt+S in the epub reader to search the whole book from a palette: "Same root" finds every form of a word
 * (using the dictionary's root for each word in the book), "Exact text" finds that spelling. Enter jumps to the match.
 * The app wires it through `bookSearchFeature` in src/features/registry.ts; the other touch points are listed in it.
 * To remove the feature, delete this folder, its registry line and those touch points (src/readerChords is shared
 * with bookVocab).
 */
import type { FeatureDescriptor } from '../features/registry';
import { BookSearchHost } from './BookSearchHost';
import { BookSearchSettings } from './BookSearchSettings';

export const bookSearchFeature: FeatureDescriptor = {
  id: 'bookSearch',
  pref: 'bookSearchEnabled',
  Host: BookSearchHost,
  SettingsSection: BookSearchSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+S'],
  touchPoints: [
    'the `bookSearchEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the reader's registerBookNavigator call, which lets a match jump to its place (src/quietReader/QuietReader.tsx, src/readerChords)",
  ],
};
