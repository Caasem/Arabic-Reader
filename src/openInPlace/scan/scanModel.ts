import type { BookMeta } from '../../types';
import type { ScanResult } from '../../sync/desktopBridge';

/** What the scan can find, in the order the format filter lists them. */
export const SCAN_FORMATS = ['pdf', 'epub', 'mobi', 'azw3', 'txt', 'md'] as const;
export type ScanFormat = (typeof SCAN_FORMATS)[number];

/** PDF and EPUB open where they are; the rest can only be added to the library (they need converting). */
export const OPENS_IN_PLACE: readonly string[] = ['pdf', 'epub'];

/** Shown on by default. TXT and Markdown are off: most of them are not books. */
export const DEFAULT_FORMATS: readonly ScanFormat[] = ['pdf', 'epub', 'mobi', 'azw3'];

export const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3', txt: 'TXT', md: 'Markdown' };

export type ScanSort = 'name' | 'folder' | 'size' | 'date';

export interface ScanRow extends ScanResult {
  folder: string;
  inLibrary: boolean;
}

/** A path as a comparison key: Windows paths (a drive letter) ignore case and slash direction. */
export function pathKey(path: string): string {
  return /^[a-z]:[\\/]/i.test(path) ? path.toLowerCase().replace(/\//g, '\\') : path;
}

/** The folder a file sits in. */
export function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut <= 0 ? path.slice(0, cut + 1) : path.slice(0, cut);
}

/** A folder path shortened to its last two parts, e.g. `…/Documents/Books`. */
export function shortFolder(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? folder : `…/${parts.slice(-2).join('/')}`;
}

/** The hashes of the files the library has: a PDF's original, an EPUB's file. */
export function libraryHashes(books: BookMeta[]): Set<string> {
  const out = new Set<string>();
  for (const book of books) {
    if (book.pdf?.originalHash) out.add(book.pdf.originalHash);
    if (book.fileHash) out.add(book.fileHash);
  }
  return out;
}

/**
 * Rows for the list. A file is "in library" when the app has seen that path (opened or added it) and the book with
 * that file's hash is in the library. Nothing is hashed here: the scan reads names, sizes and dates only.
 */
export function toRows(results: ScanResult[], known: { path: string; hash: string }[], inLibraryHashes: Set<string>): ScanRow[] {
  const have = new Set<string>();
  for (const { path, hash } of known) if (inLibraryHashes.has(hash)) have.add(pathKey(path));
  return results.map((r) => ({ ...r, folder: folderOf(r.path), inLibrary: have.has(pathKey(r.path)) }));
}

export interface ScanFilter {
  formats: ReadonlySet<string>;
  /** Only files inside this folder (one of the places scanned), or all when null. */
  folder: string | null;
  text: string;
  hideInLibrary: boolean;
}

const inside = (path: string, folder: string) => {
  const p = pathKey(path);
  const f = pathKey(folder).replace(/[\\/]+$/, '');
  return p.startsWith(f + '\\') || p.startsWith(f + '/');
};

export function filterRows(rows: ScanRow[], filter: ScanFilter): ScanRow[] {
  const text = filter.text.trim().toLowerCase();
  return rows.filter(
    (r) =>
      filter.formats.has(r.format) &&
      (!filter.folder || inside(r.path, filter.folder)) &&
      (!text || r.name.toLowerCase().includes(text)) &&
      !(filter.hideInLibrary && r.inLibrary)
  );
}

export function sortRows(rows: ScanRow[], sort: ScanSort, descending: boolean): ScanRow[] {
  const by: Record<ScanSort, (a: ScanRow, b: ScanRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    folder: (a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name),
    size: (a, b) => a.size - b.size,
    date: (a, b) => a.mtime - b.mtime,
  };
  const sorted = [...rows].sort(by[sort]);
  return descending ? sorted.reverse() : sorted;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
