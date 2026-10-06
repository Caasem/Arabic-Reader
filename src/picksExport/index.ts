/**
 * Press Alt+P while reading to open a panel with the dictionary entries you saved from the current book
 * and a button that writes them to a small file. It is for the saved-entries test in
 * docs/specs/crowd-sense-ranking.md (phase 0): a few readers send their file, and
 * `scripts/summarize-saved-entries.mjs` shows whether they chose the same entries. Nothing is sent
 * anywhere; the reader saves or copies the file and passes it on.
 *
 * Self-contained: the app touches this folder in one place only, <PicksExportHost> mounted in
 * ReaderSwitch beside the Alt+V host. There is no setting and no preference.
 * To remove it, delete this folder, `scripts/summarize-saved-entries.mjs` and that one line.
 */
export { PicksExportHost } from './PicksExportHost';
export { buildSavedEntriesExport, savedEntriesFileName, type SavedEntriesExport } from './buildExport';
export { formatSummary, summarizeExports } from './summary';
