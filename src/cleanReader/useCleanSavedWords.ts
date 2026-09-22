import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { vocabularyService } from '../vocabulary/vocabularyService';
import type { SavedWords } from '../components/reader/hooks/useSavedWords';

const SAVED_CLASS = 'ar-word--saved';

function paint(root: ParentNode | null, saved: ReadonlySet<string>, onlyWord?: string): void {
  root?.querySelectorAll<HTMLElement>('.ar-word').forEach((el) => {
    const word = el.dataset.word;
    if (!word || (onlyWord !== undefined && word !== onlyWord)) return;
    el.classList.toggle(SAVED_CLASS, saved.has(word));
  });
}

export interface CleanSavedWords extends SavedWords {
  /** Recolors the whole container; call after each chapter renders. */
  repaint(): void;
}

/** Saved-word coloring for text rendered directly in the page (the epub
 * reader's useSavedWords looks for section iframes instead). */
export function useCleanSavedWords(bookId: string, containerRef: RefObject<HTMLElement | null>): CleanSavedWords {
  const savedRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    savedRef.current = new Set();
    loadedRef.current = vocabularyService
      .listForBook(bookId)
      .then((items) => {
        if (cancelled) return;
        savedRef.current = new Set(items.map((item) => item.surfaceForm));
        paint(containerRef.current, savedRef.current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, containerRef]);

  return useMemo(
    () => ({
      applyTo() {
        this.repaint();
      },
      repaint() {
        paint(containerRef.current, savedRef.current);
        void loadedRef.current.then(() => paint(containerRef.current, savedRef.current));
      },
      setSaved(word, saved) {
        if (saved) savedRef.current.add(word);
        else savedRef.current.delete(word);
        paint(containerRef.current, savedRef.current, word);
      },
    }),
    [containerRef]
  );
}
