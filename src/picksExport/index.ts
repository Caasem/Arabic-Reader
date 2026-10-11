/**
 * Press Alt+P while reading to open a panel with the dictionary entries you saved from the current book and a button
 * that writes them to a small file. It is for the saved-entries test in docs/specs/crowd-sense-ranking.md (phase 0):
 * a few readers send their file, and `scripts/summarize-saved-entries.mjs` shows whether they chose the same entries.
 * Nothing is sent anywhere; the reader saves or copies the file and passes it on. There is no setting and no
 * preference.
 *
 * The app wires it through `picksExportFeature` in src/features/registry.ts; the other touch points are listed in it.
 * To remove it, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { PicksExportHost } from './PicksExportHost';

export const picksExportFeature: FeatureDescriptor = {
  id: 'picksExport',
  Host: PicksExportHost,
  chords: ['Alt+P'],
  touchPoints: [
    'the summary script scripts/summarize-saved-entries.mjs, which reads src/picksExport/summary.ts',
    'the readable labels it keeps on each saved pick (src/persistence/sensePicksRepo.ts)',
  ],
};

export { buildSavedEntriesExport, savedEntriesFileName, type SavedEntriesExport } from './buildExport';
export { formatSummary, summarizeExports } from './summary';
