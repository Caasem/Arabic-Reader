import { useEffect, useRef, useState } from 'react';
import { libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import { openBook, searchRoot, searchText, type BookHit, type BookSearchMode, type OpenedBook } from './engine';

const DEBOUNCE_MS = 300;

export interface PaletteState {
  loading: boolean;
  /** The book could not be read (e.g. a file that is no longer stored). */
  failed: boolean;
  hits: BookHit[] | null;
  roots: string[];
}

const IDLE: PaletteState = { loading: false, failed: false, hits: null, roots: [] };

/** Opens the book once while the palette is mounted and searches it as you type. */
export function useBookSearchPalette(book: BookMeta, query: string, mode: BookSearchMode): PaletteState {
  const openedRef = useRef<Promise<OpenedBook | null> | null>(null);
  const [state, setState] = useState<PaletteState>(IDLE);

  useEffect(() => {
    const promise = (async () => {
      const file = await libraryService.getBookFile(book.id);
      return file ? await openBook(file) : null;
    })().catch(() => null);
    openedRef.current = promise;
    return () => {
      void promise.then((opened) => opened?.book.destroy());
      openedRef.current = null;
    };
  }, [book.id]);

  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      const opened = await openedRef.current;
      if (stale) return;
      if (!opened) return setState({ ...IDLE, failed: true });
      try {
        if (mode === 'root') {
          const r = await searchRoot(opened, book.id, trimmed);
          if (!stale) setState({ loading: false, failed: false, hits: r.hits, roots: r.roots });
        } else {
          const hits = await searchText(opened, trimmed);
          if (!stale) setState({ loading: false, failed: false, hits, roots: [] });
        }
      } catch {
        if (!stale) setState({ ...IDLE, failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, mode, book.id]);

  return trimmed ? state : IDLE;
}
