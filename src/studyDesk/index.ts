/**
 * The study desk (docs/features/study-desk.md). Self-contained: the app wires it through `studyDeskFeature` in
 * src/features/registry.ts; the other touch points are listed in it. Every change is listed in
 * docs/changes/study-desk-changes.md. To remove the feature, delete this folder, its registry line and those touch
 * points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { DeskHost } from './DeskHost';
import { StudyDeskSettings } from './StudyDeskSettings';

export const studyDeskFeature: FeatureDescriptor = {
  id: 'studyDesk',
  pref: 'studyDeskEnabled',
  Host: DeskHost,
  SettingsSection: StudyDeskSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+I', 'Alt+C', 'Alt+M', 'Alt+U', 'Alt+X', 'Alt+Shift+X'],
  touchPoints: [
    'the `studyDesk*` preferences: studyDeskEnabled, studyDeskMargins, studyDeskMarginsInDocument, studyDeskCards, studyDeskMarginsToInbox (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'its database (DESK_DB) and the desk image blobs in the storage registry (src/storage/registry.ts), and the full export (src/dataExport/stores.ts)',
    "annotate's sketches, which send ink and notes to the margins and read the preference (src/annotate: AnnotateHost, SketchPanel, placeLinks, toMargin)",
    "the PDF highlighter's colour presets (src/pdf/import/PdfHighlighterSettings.tsx, from highlighterColour)",
    "the dictionary search's Shell frame, which its inbox and pull-in reuse (src/dictionarySearch/Shell.tsx)",
  ],
};
