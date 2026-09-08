import ePub from 'epubjs';
import { persistenceService } from '../persistence/db';
import type { BookMeta } from '../types';

/**
 * Book-library operations: importing a file into persistent storage
 * (extracting title/author/cover along the way) and listing/removing books.
 * Keeps epub.js metadata-sniffing out of the UI layer.
 */
export class LibraryService {
  async importEpub(file: File): Promise<BookMeta> {
    const buf = await file.arrayBuffer();
    const book = ePub(buf.slice(0)); // slice: epub.js may detach the buffer
    await book.ready;
    const metadata = await book.loaded.metadata;
    let coverDataUrl: string | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) coverDataUrl = await this.urlToDataUrl(coverUrl);
    } catch {
      // no cover — fine, library UI falls back to a generated placeholder
    }
    book.destroy();

    const meta: BookMeta = {
      id: 'book_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
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

  private async urlToDataUrl(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
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

  async progressFor(bookId: string): Promise<number> {
    const pos = await persistenceService.getReadingPosition(bookId);
    return pos?.percent ?? 0;
  }
}

export const libraryService = new LibraryService();
