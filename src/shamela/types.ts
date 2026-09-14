/** Shamela library book metadata from search/browse. */
export interface ShamelaCatalogBook {
  id: number;
  title: string;
  author?: string;
  /** Brief description from Shamela catalog. */
  description?: string;
}

/** A page fetched from Shamela's ajax endpoint. */
export interface ShamelaPgeContent {
  nass: string; // Arabic text content (HTML)
  pageNum: number;
  nextId: string | null; // null = last page
}

/** Options for browsing/searching Shamela. */
export interface ShamlaSearchOptions {
  query: string;
  limit?: number; // max results to return
}

export interface ShamelaCategoryOptions {
  categoryId: number;
  limit?: number;
}

export interface ShamelaBrowseErrorData {
  code: 'network' | 'parse' | 'notfound' | 'invalid';
  message: string;
}

export class ShamelaBrowseError extends Error {
  code: 'network' | 'parse' | 'notfound' | 'invalid';

  constructor(code: 'network' | 'parse' | 'notfound' | 'invalid', message: string) {
    super(message);
    this.code = code;
    this.name = 'ShamelaBrowseError';
  }
}
