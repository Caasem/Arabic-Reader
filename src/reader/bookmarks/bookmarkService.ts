import { persistenceService } from '../../persistence/db';
import type { BookMeta, Bookmark } from '../../types';

/**
 * Bookmark CRUD -- deliberately separate from Highlight/AnnotationService
 * (a bookmark is a precise *point*, not a marked span of text with a
 * colour/note) and from the automatic per-book ReadingPosition (that's one
 * "where I left off" the app maintains for you; bookmarks are any number of
 * markers the reader places on purpose). Mirrors AnnotationService's shape.
 */
export class BookmarkService {
  async create(params: {
    book: BookMeta;
    cfi: string;
    percent: number;
    /** A real "Page N of Total" label, if epub.js's locations index has
     * finished generating for this book (see EpubService.getPageLabel) --
     * falls back to a percent label when it hasn't (or never finishes,
     * e.g. a very short book/section). */
    pageLabel?: string;
    chapterHref?: string;
    chapterLabel?: string;
  }): Promise<Bookmark> {
    const bookmark: Bookmark = {
      id: 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      bookId: params.book.id,
      bookTitle: params.book.title,
      cfi: params.cfi,
      percent: params.percent,
      locationLabel: params.pageLabel ?? `${Math.round(params.percent * 100)}%`,
      chapterHref: params.chapterHref,
      chapterLabel: params.chapterLabel,
      createdAt: Date.now(),
    };
    await persistenceService.saveBookmark(bookmark);
    return bookmark;
  }

  async remove(id: string): Promise<void> {
    await persistenceService.deleteBookmark(id);
  }

  async listForBook(bookId: string): Promise<Bookmark[]> {
    return persistenceService.getBookmarksForBook(bookId);
  }
}

export const bookmarkService = new BookmarkService();
