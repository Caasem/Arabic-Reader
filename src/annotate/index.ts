/**
 * Ink and sketches (docs/features/annotate.md). Self-contained: the app wires it through `annotateFeature` in
 * src/features/registry.ts, whose touch points list the rest. Every change is listed in
 * docs/changes/annotate-changes.md.
 */
import type { FeatureDescriptor } from '../features/registry';
import { AnnotateHost } from './AnnotateHost';
import { AnnotateSettings } from './AnnotateSettings';

export const annotateFeature: FeatureDescriptor = {
  id: 'annotate',
  pref: 'annotateEnabled',
  Host: AnnotateHost,
  SettingsSection: AnnotateSettings,
  settingsGroup: 'dictionary',
  chords: ['Alt+W', 'Alt+K', 'Alt+Shift+K'],
  touchPoints: [
    'the `annotateEnabled` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'its ink database (INK_DB) in the storage registry (src/storage/registry.ts) and the full export (src/dataExport/stores.ts)',
    "the study desk's margins and PDF pages, which draw and select ink with its geometry and ink UI (src/studyDesk: marginInk, MarginLayer, PdfMargin, PdfSelect, docxExport)",
  ],
};
