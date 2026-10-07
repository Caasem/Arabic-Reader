/** The format the book was added in; anything but EPUB is converted to EPUB on import (src/importFormats). */
export type BookFormat = 'epub' | 'mobi' | 'azw3' | 'txt' | 'md' | 'pdf';

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  language?: string;
  format: BookFormat;
  /** The added file's name, when it was converted from another format. */
  originalFileName?: string;
  coverDataUrl?: string;
  addedAt: number;
  /** Bytes of the (already-normalized-to-epub) source file, stored separately in blob storage. */
  sizeBytes: number;
  /** Total locations/chars used to compute reading progress, filled in after first open. */
  totalLocations?: number;
  /** Last change to this row; set by the persistence write layer (schema v10). */
  updatedAt?: number;
  /**
   * SHA-256 (hex) of the book file, which lives in the BlobStore (namespace `book`). A reference, not
   * content: it syncs, so another device can tell a file it already has is this book's. Absent on books
   * whose file is still in the legacy `bookFiles` table (schema v13 migration, src/persistence/bookFileMigration.ts).
   */
  fileHash?: string;
}

/** The one automatic "where I left off" per book. */
export interface ReadingPosition {
  bookId: string;
  cfi: string;
  percent: number; // 0..1
  chapterHref?: string;
  chapterLabel?: string;
  updatedAt: number;
}

export interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'purple' | 'red';

/** A marked span of text, with a color and optional note. */
export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  cfiRange: string;
  text: string;
  color: HighlightColor;
  note?: string;
  chapterHref?: string;
  chapterLabel?: string;
  createdAt: number;
  updatedAt: number;
}

/** A location the reader explicitly marked; a book can have any number,
 * including several on one page. */
export interface Bookmark {
  id: string;
  bookId: string;
  bookTitle: string;
  cfi: string;
  percent: number; // 0..1, at the time the bookmark was made
  /** "Page N of Total" once the book's locations index exists (epub.js
   * splits by character count, so pages are approximate); a percent label
   * ("62%") for bookmarks made before that. */
  locationLabel: string;
  chapterHref?: string;
  chapterLabel?: string;
  createdAt: number;
  /** Set by the persistence write layer (schema v10). */
  updatedAt?: number;
}
