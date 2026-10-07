/**
 * The full export file (docs/specs/export-format.md): one .zip a reader can open with any zip tool.
 *
 *   records.json      every class A table, plus the other stores the registry marks as JSON
 *   vocabulary.csv    one row per saved word, for spreadsheets
 *   highlights.md     highlights and notes per book, for reading
 *   books/            the original book files (optional)
 *   README.txt        what the parts are
 */
export const EXPORT_FORMAT_VERSION = 1;

export const RECORDS_FILE = 'records.json';
export const VOCABULARY_FILE = 'vocabulary.csv';
export const HIGHLIGHTS_FILE = 'highlights.md';
export const BOOKS_DIR = 'books/';

export interface RecordsFile {
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  /** Rows of each exported store, keyed by its StorageRegistry id. */
  tables: Record<string, unknown[]>;
}

export class ExportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFormatError';
  }
}

export const NEWER_VERSION_MESSAGE = 'This file was made by a newer version of Arabic Reader. Update the app and try again.';

/** `books/<title>__<book id>.epub`: readable for a person, and the id is how an import finds the record. */
export function bookFileName(id: string, title: string): string {
  const noControls = Array.from(title, (c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('');
  const safe = noControls.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'book';
  return `${BOOKS_DIR}${safe}__${id}.epub`;
}

/** The book id in an exported file name, or null when the name is not one of ours. */
export function bookIdFromFileName(path: string): string | null {
  const m = /^books\/.*__([A-Za-z0-9_-]+)\.epub$/.exec(path);
  return m ? m[1] : null;
}

export const README_TEXT = `Arabic Reader: full export

records.json     Everything you made in the app (vocabulary, highlights, notes, bookmarks, reading positions, history,
                 settings), as JSON. "formatVersion" says which layout this is. Importing it back into Arabic Reader
                 restores it without overwriting anything newer on the device.
vocabulary.csv   Your saved words for a spreadsheet: word, meaning, root, lemma, sentence, book, added, mastery, due.
highlights.md    Your highlights and notes, by book.
books/           The original book files, named <title>__<id>.epub. Optional.

Nothing here is tied to the app: the files are plain JSON, CSV, Markdown and EPUB.
`;
