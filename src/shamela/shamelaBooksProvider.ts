import type { ShamelaCatalogBook, ShamelaPgeContent, ShamlaSearchOptions } from './types';
import { ShamelaBrowseError } from './types';

const BASE = 'https://winongkencono-shamelah.hf.space';

interface HfBookSummary {
  book_id: number;
  title_ar: string;
  main_author_name_ar?: string | null;
  volume_count?: number;
}

interface HfPageResponse {
  content?: string;
  body?: string;
  page_num: number;
  navigation: {
    hasNext: boolean;
    nextGlobalOrder: number | null;
  };
}

/**
 * API client for the community-run Shamela Library dataset hosted on
 * Hugging Face Spaces. This is an unofficial mirror of al-Maktaba
 * al-Shamela, not shamela.ws itself, so endpoint availability isn't
 * guaranteed long-term.
 */
export class ShamelaBooksProvider {
  private lastRequestTime = 0;
  private readonly minDelayMs = 150; // Polite rate limiting

  /** Search the catalog by title/author. */
  async searchBooks(options: ShamlaSearchOptions): Promise<ShamelaCatalogBook[]> {
    const limit = options.limit ?? 50;
    let books = await this.searchOnce(options.query, limit);

    // The dataset lazily indexes books on first access; an empty result on
    // the very first query of a session is often a cold-start miss rather
    // than genuinely "no matches" — retry once after a short delay.
    if (books.length === 0) {
      await this.delay(1000);
      books = await this.searchOnce(options.query, limit);
    }

    return books.map(toCatalogBook);
  }

  private async searchOnce(query: string, limit: number): Promise<HfBookSummary[]> {
    const json = await this.getJson<{ data: HfBookSummary[] }>('/api/search', {
      q: query,
      scope: 'books',
      limit: String(limit),
    });
    return json.data;
  }

  /**
   * Stream every page of a book in reading order, starting from the first.
   * Stops when the dataset reports no next page, or at `maxPages`.
   */
  async *fetchBookPages(
    bookId: number,
    maxPages = 5000,
    signal?: AbortSignal
  ): AsyncGenerator<ShamelaPgeContent, void, unknown> {
    let globalOrder: number | null = 1;
    let pageCount = 0;

    while (globalOrder !== null && pageCount < maxPages) {
      if (signal?.aborted) return;

      const data: HfPageResponse = await this.fetchPage(bookId, globalOrder);

      yield {
        nass: data.content ?? data.body ?? '',
        pageNum: data.page_num,
        nextId: null,
      };

      globalOrder = data.navigation.hasNext ? data.navigation.nextGlobalOrder : null;
      pageCount++;
    }
  }

  private async fetchPage(bookId: number, globalOrder: number): Promise<HfPageResponse> {
    const result = await this.getJson<{ data: HfPageResponse }>(
      `/api/books/${bookId}/pages/${globalOrder}`
    );
    return result.data;
  }

  private async getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.respectRateLimit();

    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch {
      throw new ShamelaBrowseError('network', 'Network error');
    }

    if (!response.ok) {
      throw new ShamelaBrowseError('network', `HTTP ${response.status}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ShamelaBrowseError('parse', 'Invalid JSON response');
    }

    if (typeof json !== 'object' || json === null) {
      throw new ShamelaBrowseError('parse', 'Unexpected response shape');
    }

    const obj = json as Record<string, unknown>;
    if (obj.success === false) {
      const error = obj.error as { code?: string; message?: string } | undefined;
      throw new ShamelaBrowseError(
        error?.code === 'BOOK_NOT_FOUND' ? 'notfound' : 'parse',
        error?.message ?? 'Shamela API error'
      );
    }

    return json as T;
  }

  private async respectRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function toCatalogBook(book: HfBookSummary): ShamelaCatalogBook {
  return {
    id: book.book_id,
    title: book.title_ar,
    author: book.main_author_name_ar ?? undefined,
    description:
      book.volume_count && book.volume_count > 1 ? `${book.volume_count} أجزاء` : undefined,
  };
}

export const shamelaBooksProvider = new ShamelaBooksProvider();
