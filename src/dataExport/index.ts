/**
 * Full export and import (roadmap `storage-ux`, docs/specs/export-format.md, M1h): everything the reader made, in
 * open formats, in one zip. Which stores take part comes from the StorageRegistry (`exportFormat`); a test fails
 * if a store marked for export has no reader here.
 *
 * Touch points outside this folder:
 * - src/storage/registry.ts (`exportFormat` of each store).
 * - src/components/shared/settings/StorageSettings.tsx: the Export everything / Import buttons.
 * - PersonalDictionaryProvider.refresh(): called after an import restores the dictionary.
 * To remove the feature: delete this folder and the buttons.
 */
export { buildExport, estimateBookFiles, exportFilename, ExportCancelled, type ExportResult } from './exportAll';
export { importExport, type ImportSummary } from './importAll';
export { ExportFormatError } from './format';
