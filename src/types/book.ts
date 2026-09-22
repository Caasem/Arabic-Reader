export type BookFormat = 'epub' | 'mobi';

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  language?: string;
  format: BookFormat;
  coverDataUrl?: string;
  addedAt: number;
  /** Bytes of the (already-normalized-to-epub) source file, stored separately in blob storage. */
  sizeBytes: number;
  /** Total locations/chars used to compute reading progress, filled in after first open. */
  totalLocations?: number;
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
}
