import { useCallback, useEffect, useState } from 'react';
import { bookmarkService } from '../../../reader/bookmarks/bookmarkService';
import type { BookMeta, Bookmark } from '../../../types';

export function useBookmarks(book: BookMeta) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    let cancelled = false;
    bookmarkService.listForBook(book.id).then((list) => {
      if (!cancelled) setBookmarks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const add = useCallback(
    async (location: { cfi: string; percent: number; pageLabel?: string; chapterHref?: string; chapterLabel?: string }) => {
      const bookmark = await bookmarkService.create({ book, ...location });
      setBookmarks((prev) => [...prev, bookmark]);
    },
    [book]
  );

  const remove = useCallback(async (id: string) => {
    await bookmarkService.remove(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return { bookmarks, add, remove };
}
