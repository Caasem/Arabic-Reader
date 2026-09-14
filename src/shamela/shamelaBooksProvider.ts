import type { ShamelaCatalogBook, ShamelaPgeContent, ShamlaSearchOptions } from './types';
import { ShamelaBrowseError } from './types';

const SHAMELA_BASE = 'https://shamela.ws';
const USER_AGENT = 'Mozilla/5.0 (compatible; Arabic-Reader Shamela)';

/**
 * API client for Shamela Library. Uses public endpoints without requiring
 * authentication. Requests are rate-limited to be polite.
 */
export class ShamelaBooksProvider {
  private lastRequestTime = 0;
  private readonly minDelayMs = 500; // Polite rate limiting

  /** Search for books by title. */
  async searchBooks(options: ShamlaSearchOptions): Promise<ShamelaCatalogBook[]> {
    await this.respectRateLimit();

    const url = new URL(`${SHAMELA_BASE}/ajax/book/`);
    url.searchParams.set('q', options.query);
    url.searchParams.set('term', options.query);

    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        throw new ShamelaBrowseError('network', `HTTP ${response.status}`);
      }

      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new ShamelaBrowseError('parse', 'Expected array response');
      }

      return data
        .slice(0, options.limit ?? 50)
        .filter((item: unknown) => isValidCatalogBook(item))
        .map((item: unknown) => item as ShamelaCatalogBook);
    } catch (error) {
      if (error instanceof ShamelaBrowseError) throw error;
      if (error instanceof TypeError) {
        throw new ShamelaBrowseError('network', 'Network error');
      }
      throw new ShamelaBrowseError('parse', 'Failed to parse response');
    }
  }

  /** Fetch the first page of a book to get the starting page ID. */
  async getBookFirstPageId(bookId: number): Promise<string> {
    await this.respectRateLimit();

    try {
      const response = await fetch(`${SHAMELA_BASE}/book/${bookId}`, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        throw new ShamelaBrowseError('network', `HTTP ${response.status}`);
      }

      const html = await response.text();
      // Extract first page ID from HTML (basic pattern matching)
      // The plugin extracts this from the book's index page
      const match = html.match(/data-page-id=["'](\d+)["']/);
      if (!match) {
        throw new ShamelaBrowseError('parse', 'Could not find first page ID');
      }
      return match[1];
    } catch (error) {
      if (error instanceof ShamelaBrowseError) throw error;
      throw new ShamelaBrowseError('network', 'Failed to fetch book page');
    }
  }

  /** Fetch a single page's content. */
  async getPageContent(bookId: number, pageId: string): Promise<ShamelaPgeContent> {
    await this.respectRateLimit();

    try {
      const response = await fetch(`${SHAMELA_BASE}/ajax/pageContent/${bookId}/${pageId}`, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        throw new ShamelaBrowseError('network', `HTTP ${response.status}`);
      }

      const data = (await response.json()) as unknown;
      if (!isValidPageContent(data)) {
        throw new ShamelaBrowseError('parse', 'Invalid page content structure');
      }

      return data as ShamelaPgeContent;
    } catch (error) {
      if (error instanceof ShamelaBrowseError) throw error;
      throw new ShamelaBrowseError('network', 'Failed to fetch page content');
    }
  }

  /** Fetch all pages of a book, respecting max page limit. */
  async *fetchBookPages(
    bookId: number,
    firstPageId: string,
    maxPages = 5000,
    signal?: AbortSignal
  ): AsyncGenerator<ShamelaPgeContent, void, unknown> {
    let pageId: string | null = firstPageId;
    let pageCount = 0;

    while (pageId && pageCount < maxPages) {
      if (signal?.aborted) return;

      const page = await this.getPageContent(bookId, pageId);
      yield page;

      pageId = page.nextId;
      pageCount++;
    }
  }

  private async respectRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

function isValidCatalogBook(item: unknown): item is ShamelaCatalogBook {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.id === 'number' &&
    typeof obj.title === 'string' &&
    obj.title.length > 0
  );
}

function isValidPageContent(data: unknown): data is ShamelaPgeContent {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.nass === 'string' &&
    typeof obj.pageNum === 'number' &&
    (obj.nextId === null || typeof obj.nextId === 'string')
  );
}

export const shamelaBooksProvider = new ShamelaBooksProvider();
