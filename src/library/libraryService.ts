import ePub from 'epubjs';
import { sha256Hex } from '../blobStore';
import { persistenceService } from '../persistence';
import type { BookFormat, BookMeta } from '../types';
import { newId } from '../utils/id';
import { notifyLibraryChanged } from './libraryChanged';

export interface BookReadingInfo {
  percent: number;
  /** undefined for a book that has never been opened. */
  lastReadAt?: number;
  /** The chapter the reader was last in, when the reader recorded one. */
  chapterLabel?: string;
}

/** The file is already a book in the library (same bytes, found by SHA-256). */
export class DuplicateBookError extends Error {
  readonly existing: BookMeta;
  constructor(existing: BookMeta) {
    super(`"${existing.title}" is already in your library.`);
    this.name = 'DuplicateBookError';
    this.existing = existing;
  }
}

/**
 * Library operations: importing a file (extracting title/author/cover),
 * listing and removing books.
 */
export class LibraryService {
  /**
   * Adds any supported book file: EPUB as is, PDF, TXT, Markdown, MOBI and AZW3 converted to EPUB first
   * (src/importFormats). `warnings` lists anything the conversion had to leave out.
   */
  async importBook(file: File, options: { browse?: BookMeta['browse'] } = {}): Promise<{ meta: BookMeta; converted?: { format: BookFormat; chapters: number; pages?: number; reflow?: 'ok' | 'broken' | 'none'; warnings: string[] } }> {
    const { formatOf, convertToEpub } = await import('../importFormats');
    const format = formatOf(file.name);
    if (!format) throw new Error(`"${file.name}" isn't a book type Arabic Reader can open. Add an EPUB, PDF, TXT, Markdown, MOBI or AZW3 file.`);
    if (format === 'epub') return { meta: await this.importEpub(file, options) };
    const converted = await convertToEpub(file);
    let meta = await this.importEpub(converted.epub, { format, originalFileName: file.name, ...options });
    if (converted.pdf && converted.original) {
      // Keep the PDF itself for the Original pages view.
      await persistenceService.savePdfOriginal(meta.id, converted.original, converted.pdf);
      meta = (await persistenceService.getBook(meta.id)) ?? meta;
    }
    return { meta, converted: { format, chapters: converted.chapters, pages: converted.pages, reflow: converted.pdf?.reflow, warnings: converted.warnings } };
  }

  /** `id` is only for books every install gets (the starter books), so devices that sync share one record. */
  async importEpub(file: File, options: { id?: string; format?: BookFormat; originalFileName?: string; browse?: BookMeta['browse'] } = {}): Promise<BookMeta> {
    if (!options.id) {
      const existing = await persistenceService.getBookByFileHash(await sha256Hex(file));
      if (existing) {
        if (await persistenceService.getBookFile(existing.id)) throw new DuplicateBookError(existing);
        // A book that arrived by sync without its file: these are its bytes, so attach them instead of adding a second book.
        await persistenceService.saveBookFile(existing.id, file);
        return existing;
      }
    }
    const buf = await file.arrayBuffer();
    // Opened by hand so its asset-URL pass can be switched off: this read only wants the title, author and cover, and
    // epub.js runs that pass in the background after opening, so destroying the book below used to end it with a
    // "reading 'replaceCss'" TypeError on every import.
    const book = ePub();
    (book as unknown as { replacements(): Promise<void> }).replacements = () => Promise.resolve();
    void book.open(buf.slice(0)).catch(() => {}); // epub.js may detach the buffer
    let coverDataUrl: string | undefined;
    let metadata: { title?: string; creator?: string; language?: string };
    try {
      await book.ready;
      metadata = await book.loaded.metadata;
      try {
        const coverUrl = await book.coverUrl();
        if (coverUrl) coverDataUrl = await blobUrlToDataUrl(coverUrl);
      } catch {
        // no cover -- the library shows a generated placeholder
      }
    } finally {
      book.destroy();
    }

    const meta: BookMeta = {
      id: options.id ?? newId('book'),
      title: metadata.title || file.name.replace(/\.epub$/i, ''),
      author: metadata.creator || undefined,
      language: metadata.language || undefined,
      format: options.format ?? 'epub',
      ...(options.originalFileName ? { originalFileName: options.originalFileName } : {}),
      ...(options.browse ? { browse: options.browse } : {}),
      coverDataUrl,
      addedAt: Date.now(),
      sizeBytes: file.size,
    };
    await persistenceService.saveBook(meta, file);
    return meta;
  }

  async listBooks(): Promise<BookMeta[]> {
    return persistenceService.getBooks();
  }

  async getBookFile(id: string): Promise<Blob | undefined> {
    return persistenceService.getBookFile(id);
  }

  /** Books whose file is on this device. A book synced from another device may have none yet. */
  async listBookFileIds(): Promise<Set<string>> {
    return new Set(await persistenceService.getBookFileIds());
  }

  /** Give a book that arrived without its file (via sync) the file, keeping its id and history. */
  async attachBookFile(id: string, file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.epub')) throw new Error('Choose the EPUB file for this book.');
    await persistenceService.saveBookFile(id, file);
  }

  /** Free the space a book's file takes, keeping the book. "Add file" brings it back. */
  async removeBookFileOnly(id: string): Promise<void> {
    await persistenceService.removeBookFile(id);
    notifyLibraryChanged();
  }

  async removeBook(id: string): Promise<void> {
    await persistenceService.deleteBook(id);
    notifyLibraryChanged();
  }

  /** Progress and last-read time for many books in one read. */
  async readingInfoForBooks(bookIds: string[]): Promise<Record<string, BookReadingInfo>> {
    const positions = await persistenceService.getReadingPositions(bookIds);
    return Object.fromEntries(
      bookIds.map((id) => {
        const pos = positions.get(id);
        return [id, { percent: pos?.percent ?? 0, lastReadAt: pos?.updatedAt, chapterLabel: pos?.chapterLabel }];
      })
    );
  }
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const libraryService = new LibraryService();
