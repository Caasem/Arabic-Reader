import type { BookMeta } from '../types';
import { persistenceService } from '../persistence/db';
import { newId } from '../utils/id';
import { EpubBuilder } from './epubBuilder';
import { shamelaBooksProvider } from './shamelaBooksProvider';
import type { ShamelaCatalogBook } from './types';
import { ShamelaBrowseError } from './types';

/**
 * High-level service for downloading Shamela books and importing them.
 * Handles the full workflow: search → download → convert to EPUB → save.
 */
export class ShamelaService {
  /**
   * Search for books on Shamela.
   * @throws ShamelaBrowseError on network or parsing errors
   */
  async searchBooks(query: string, limit = 50): Promise<ShamelaCatalogBook[]> {
    return shamelaBooksProvider.searchBooks({ query, limit });
  }

  /**
   * Download a Shamela book and convert it to an EPUB file.
   * @throws ShamelaBrowseError on network or parsing errors
   * @throws Error if conversion fails
   * @returns Promise resolving when download is complete; call progress callback for updates
   */
  async downloadBook(
    book: ShamelaCatalogBook,
    onProgress?: (status: string, percent: number) => void
  ): Promise<BookMeta> {
    onProgress?.('Downloading pages...', 0);

    try {
      // Collect all pages
      const pages = [];
      let pageCount = 0;
      for await (const page of shamelaBooksProvider.fetchBookPages(book.id)) {
        pages.push(page);
        pageCount++;
        // Page count isn't known upfront, so this eases toward (never hits) 90%
        // rather than plateauing once a book passes 100 pages.
        const percent = 90 * (1 - 100 / (100 + pageCount));
        onProgress?.(`Downloaded ${pageCount} pages...`, percent);
      }

      if (pages.length === 0) {
        throw new Error('No pages downloaded');
      }

      onProgress?.('Building EPUB...', 95);

      // Build EPUB
      const builder = new EpubBuilder({
        title: book.title,
        author: book.author,
        language: 'ar',
      });
      builder.addPages(pages);
      const epubBlob = await builder.build();

      onProgress?.('Importing book...', 98);

      // Save to library using existing import logic
      // Create a fake File from the blob
      const file = new File([epubBlob], `${book.title}.epub`, {
        type: 'application/epub+zip',
      });

      const meta: BookMeta = {
        id: newId('book'),
        title: book.title,
        author: book.author || undefined,
        language: 'ar',
        format: 'epub',
        addedAt: Date.now(),
        sizeBytes: file.size,
      };

      await persistenceService.saveBook(meta, epubBlob);
      onProgress?.('Complete!', 100);

      return meta;
    } catch (error) {
      if (error instanceof ShamelaBrowseError) {
        throw new Error(`Download failed: ${error.message} (${error.code})`);
      }
      throw error;
    }
  }
}

export const shamelaService = new ShamelaService();
