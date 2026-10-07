import JSZip from 'jszip';
import { notifyLibraryChanged } from '../library/libraryChanged';
import { parseBackup } from '../persistence/backup';
import { persistenceService } from '../persistence';
import { EXPORT_FORMAT_VERSION, ExportFormatError, NEWER_VERSION_MESSAGE, RECORDS_FILE, bookIdFromFileName, type RecordsFile } from './format';
import { RECORD_STORES, type RestoreResult } from './stores';

export interface ImportSummary {
  tables: Record<string, RestoreResult>;
  /** Book files put back for books whose file was missing here. */
  booksRestored: number;
  /** Book files in the zip that this device already had. */
  booksAlreadyHere: number;
  /** Book files in the zip with no matching book record, so nothing to attach them to. */
  booksWithoutRecord: number;
  /** Rows dropped as unusable across all tables. */
  skipped: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function readRecords(zip: JSZip): Promise<RecordsFile> {
  const entry = zip.file(RECORDS_FILE);
  if (!entry) throw new ExportFormatError('This is not an Arabic Reader export: records.json is missing.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.async('string'));
  } catch {
    throw new ExportFormatError('This is not an Arabic Reader export: records.json could not be read.');
  }
  if (!isObject(parsed) || typeof parsed.formatVersion !== 'number' || !isObject(parsed.tables)) {
    throw new ExportFormatError('This is not an Arabic Reader export.');
  }
  if (parsed.formatVersion > EXPORT_FORMAT_VERSION) throw new ExportFormatError(NEWER_VERSION_MESSAGE);
  return parsed as unknown as RecordsFile;
}

const CHECKED_TABLES = ['vocabulary', 'wordInstances', 'highlights'];

/**
 * Restores an export into this device. Records go through the write layer (so sync sees them) and never replace
 * a row that is newer here; book files are attached only to books that have none on this device. Nothing is
 * ever deleted. Throws ExportFormatError, before changing anything, for a file that is not an export or comes
 * from a newer app.
 */
export async function importExport(file: Blob): Promise<ImportSummary> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ExportFormatError('This is not an Arabic Reader export: it is not a zip file.');
  }
  const records = await readRecords(zip);

  // Vocabulary, highlights and word counts come from a file anyone can edit: give them the same checks and
  // defaults as the quick backup before they reach Review or the Dashboard.
  const checked = parseBackup({
    vocabulary: records.tables.vocabulary ?? [],
    wordInstances: records.tables.wordInstances ?? [],
    highlights: records.tables.highlights ?? [],
  });
  const tables: Record<string, unknown[]> = {
    ...records.tables,
    vocabulary: checked.data.vocabulary,
    wordInstances: checked.data.wordInstances,
    highlights: checked.data.highlights,
  };

  const summary: ImportSummary = { tables: {}, booksRestored: 0, booksAlreadyHere: 0, booksWithoutRecord: 0, skipped: checked.skipped };
  for (const store of RECORD_STORES) {
    const rows = tables[store.id];
    if (!Array.isArray(rows)) continue;
    summary.tables[store.id] = await store.restore(rows);
    if (!CHECKED_TABLES.includes(store.id)) summary.skipped += summary.tables[store.id].skipped;
  }

  const have = new Set(await persistenceService.getBookFileIds());
  for (const [path, entry] of Object.entries(zip.files)) {
    const id = entry.dir ? null : bookIdFromFileName(path);
    if (!id) continue;
    if (!(await persistenceService.getBook(id))) {
      summary.booksWithoutRecord++;
    } else if (have.has(id)) {
      summary.booksAlreadyHere++;
    } else {
      await persistenceService.saveBookFile(id, new Blob([await entry.async('arraybuffer')], { type: 'application/epub+zip' }));
      summary.booksRestored++;
    }
  }
  notifyLibraryChanged();
  return summary;
}
