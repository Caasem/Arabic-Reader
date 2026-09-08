import { persistenceService } from '../../persistence/db';
import type { BookMeta, Highlight, HighlightColor } from '../../types';

/**
 * Highlight/annotation CRUD, kept separate from EpubService (which only
 * knows how to *render* a highlight into the page) and from the reader UI
 * (which only knows how to prompt for a color/note). This is the layer a
 * future native client's own rendering engine would also call into.
 */
export class AnnotationService {
  async create(params: {
    book: BookMeta;
    cfiRange: string;
    text: string;
    color: HighlightColor;
    chapterHref?: string;
    chapterLabel?: string;
    note?: string;
  }): Promise<Highlight> {
    const now = Date.now();
    const highlight: Highlight = {
      id: 'hl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      bookId: params.book.id,
      bookTitle: params.book.title,
      cfiRange: params.cfiRange,
      text: params.text,
      color: params.color,
      note: params.note,
      chapterHref: params.chapterHref,
      chapterLabel: params.chapterLabel,
      createdAt: now,
      updatedAt: now,
    };
    await persistenceService.saveHighlight(highlight);
    return highlight;
  }

  async updateColor(highlight: Highlight, color: HighlightColor): Promise<Highlight> {
    const updated = { ...highlight, color, updatedAt: Date.now() };
    await persistenceService.saveHighlight(updated);
    return updated;
  }

  async updateNote(highlight: Highlight, note: string): Promise<Highlight> {
    const updated = { ...highlight, note, updatedAt: Date.now() };
    await persistenceService.saveHighlight(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await persistenceService.deleteHighlight(id);
  }

  async listForBook(bookId: string): Promise<Highlight[]> {
    return persistenceService.getHighlightsForBook(bookId);
  }

  async listAll(): Promise<Highlight[]> {
    return persistenceService.getAllHighlights();
  }
}

export const annotationService = new AnnotationService();
