import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { vocabularyService } from '../../../vocabulary/vocabularyService';

const SAVED_CLASS = 'ar-word--saved';

export interface SavedWords {
  /** Colors saved words in a freshly rendered section. */
  applyTo(doc: Document): void;
  /** Updates one word everywhere it's currently rendered. */
  setSaved(word: string, saved: boolean): void;
}

function paint(root: ParentNode, saved: ReadonlySet<string>, onlyWord?: string): void {
  root.querySelectorAll<HTMLElement>('.ar-word').forEach((el) => {
    const word = el.dataset.word;
    if (!word || (onlyWord !== undefined && word !== onlyWord)) return;
    el.classList.toggle(SAVED_CLASS, saved.has(word));
  });
}

/** Saved-word coloring in the book text: one vocabulary read per opened book
 * (not one per section render), kept current as words are saved and removed. */
export function useSavedWords(bookId: string, containerRef: RefObject<HTMLElement | null>): SavedWords {
  const savedRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Promise<void>>(Promise.resolve());

  const renderedDocuments = useCallback(
    () =>
      Array.from(containerRef.current?.querySelectorAll('iframe') ?? [])
        .map((frame) => frame.contentDocument)
        .filter((doc): doc is Document => !!doc),
    [containerRef]
  );

  useEffect(() => {
    let cancelled = false;
    savedRef.current = new Set();
    loadedRef.current = vocabularyService
      .listForBook(bookId)
      .then((items) => {
        if (cancelled) return;
        savedRef.current = new Set(items.map((item) => item.surfaceForm));
        for (const doc of renderedDocuments()) paint(doc, savedRef.current);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, renderedDocuments]);

  return useMemo(
    () => ({
      applyTo(doc) {
        paint(doc, savedRef.current);
        void loadedRef.current.then(() => paint(doc, savedRef.current));
      },
      setSaved(word, saved) {
        if (saved) savedRef.current.add(word);
        else savedRef.current.delete(word);
        for (const doc of renderedDocuments()) paint(doc, savedRef.current, word);
      },
    }),
    [renderedDocuments]
  );
}
