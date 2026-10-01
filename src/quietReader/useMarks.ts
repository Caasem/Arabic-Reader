import { useCallback, useEffect, useState } from 'react';
import { annotationService } from '../reader/annotations';
import { bookmarkService } from '../reader/bookmarks';
import type { BookMeta, Bookmark, Highlight, HighlightColor } from '../types';

/** The open book's bookmarks and highlights, from either reader, kept in step with storage. */
export function useMarks(book: BookMeta) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let stale = false;
    void bookmarkService.listForBook(book.id).then((list) => !stale && setBookmarks(list));
    void annotationService
      .listForBook(book.id)
      .then((list) => !stale && setHighlights(list))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [book.id]);

  const addBookmark = useCallback(
    async (params: { location: string; percent: number; pageLabel: string; chapterHref: string; chapterLabel: string }) => {
      const created = await bookmarkService.create({ book, cfi: params.location, ...params });
      setBookmarks((prev) => [...prev, created]);
    },
    [book]
  );

  const removeBookmark = useCallback(async (id: string) => {
    await bookmarkService.remove(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addHighlight = useCallback(
    async (params: { location: string; text: string; color: HighlightColor; chapterHref: string; chapterLabel: string; note?: string }) => {
      const created = await annotationService.create({ book, cfiRange: params.location, ...params });
      setHighlights((prev) => [...prev, created]);
      return created;
    },
    [book]
  );

  const recolor = useCallback(async (highlight: Highlight, color: HighlightColor) => {
    const updated = await annotationService.updateColor(highlight, color);
    setHighlights((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  }, []);

  const setNote = useCallback(async (highlight: Highlight, note: string) => {
    const updated = await annotationService.updateNote(highlight, note);
    setHighlights((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  }, []);

  const removeHighlight = useCallback(async (id: string) => {
    await annotationService.remove(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  return { bookmarks, highlights, addBookmark, removeBookmark, addHighlight, recolor, setNote, removeHighlight };
}

export type Marks = ReturnType<typeof useMarks>;
