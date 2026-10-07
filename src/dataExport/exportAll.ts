import JSZip from 'jszip';
import { persistenceService } from '../persistence';
import type { Highlight, VocabularyItem } from '../types';
import { vocabularyCsv } from './csv';
import {
  EXPORT_FORMAT_VERSION,
  HIGHLIGHTS_FILE,
  README_TEXT,
  RECORDS_FILE,
  VOCABULARY_FILE,
  bookFileName,
  type RecordsFile,
} from './format';
import { highlightsMarkdown } from './highlightsMd';
import { RECORD_STORES } from './stores';

export interface ExportOptions {
  includeBooks: boolean;
  appVersion: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  now?: () => number;
}

export interface ExportResult {
  blob: Blob;
  /** Rows exported per store. */
  counts: Record<string, number>;
  books: number;
  /** Books in the library whose file is not on this device, so the zip has none for them. */
  booksWithoutFile: number;
}

export class ExportCancelled extends Error {
  constructor() {
    super('The export was cancelled.');
    this.name = 'ExportCancelled';
  }
}

/** How many book files an export would hold and their size, for the "Include book files" checkbox. */
export async function estimateBookFiles(): Promise<{ count: number; bytes: number }> {
  const ids = new Set(await persistenceService.getBookFileIds());
  const books = (await persistenceService.getBooks()).filter((b) => ids.has(b.id));
  return { count: books.length, bytes: books.reduce((n, b) => n + (b.sizeBytes || 0), 0) };
}

/**
 * Builds the full export (format.ts). Records first, so a cancel or failure while adding book files never
 * costs the part that matters; book files go in one at a time.
 */
export async function buildExport(options: ExportOptions): Promise<ExportResult> {
  const now = options.now ?? Date.now;
  const cancelled = () => {
    if (options.signal?.aborted) throw new ExportCancelled();
  };

  const tables: Record<string, unknown[]> = {};
  for (const store of RECORD_STORES) {
    cancelled();
    tables[store.id] = await store.read();
  }
  const records: RecordsFile = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date(now()).toISOString(),
    appVersion: options.appVersion,
    tables,
  };

  const zip = new JSZip();
  zip.file(RECORDS_FILE, JSON.stringify(records), { compression: 'DEFLATE' });
  zip.file(VOCABULARY_FILE, vocabularyCsv((tables.vocabulary ?? []) as VocabularyItem[]), { compression: 'DEFLATE' });
  zip.file(HIGHLIGHTS_FILE, highlightsMarkdown((tables.highlights ?? []) as Highlight[]), { compression: 'DEFLATE' });
  zip.file('README.txt', README_TEXT);

  let books = 0;
  let booksWithoutFile = 0;
  if (options.includeBooks) {
    const library = await persistenceService.getBooks();
    const have = new Set(await persistenceService.getBookFileIds());
    let done = 0;
    options.onProgress?.(0, library.length);
    for (const book of library) {
      cancelled();
      const file = have.has(book.id) ? await persistenceService.getBookFile(book.id) : undefined;
      if (file) {
        zip.file(bookFileName(book.id, book.title), file, { binary: true, compression: 'STORE' }); // an EPUB is already a zip
        books++;
      } else {
        booksWithoutFile++;
      }
      options.onProgress?.(++done, library.length);
    }
  }

  cancelled();
  const blob = await zip.generateAsync({ type: 'blob', streamFiles: true, mimeType: 'application/zip' });
  return { blob, counts: Object.fromEntries(Object.entries(tables).map(([id, rows]) => [id, rows.length])), books, booksWithoutFile };
}

export const exportFilename = (now: number = Date.now()): string => `arabic-reader-export-${new Date(now).toISOString().slice(0, 10)}.zip`;
