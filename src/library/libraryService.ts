import ePub from 'epubjs';
import { persistenceService } from '../persistence';
import type { BookMeta } from '../types';
import { newId } from '../utils/id';

export interface BookReadingInfo {
  percent: number;
  /** undefined for a book that has never been opened. */
  lastReadAt?: number;
}

/**
 * Library operations: importing a file (extracting title/author/cover),
 * listing and removing books.
 */
export class LibraryService {
  async importEpub(file: File): Promise<BookMeta> {
    const buf = await file.arrayBuffer();
    const book = ePub(buf.slice(0)); // epub.js may detach the buffer
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
      id: newId('book'),
      title: metadata.title || file.name.replace(/\.epub$/i, ''),
      author: metadata.creator || undefined,
      language: metadata.language || undefined,
      format: 'epub',
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

  async removeBook(id: string): Promise<void> {
    await persistenceService.deleteBook(id);
  }

  /** Progress and last-read time for many books in one read. */
  async readingInfoForBooks(bookIds: string[]): Promise<Record<string, BookReadingInfo>> {
    const positions = await persistenceService.getReadingPositions(bookIds);
    return Object.fromEntries(
      bookIds.map((id) => {
        const pos = positions.get(id);
        return [id, { percent: pos?.percent ?? 0, lastReadAt: pos?.updatedAt }];
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
