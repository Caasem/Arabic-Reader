import { useEffect, useMemo, useState } from 'react';
import { annotationService } from '../../../reader/annotations';
import { spineIndexOfCfi } from '../../../reader/epub/cfi';
import type { Highlight } from '../../../types';

/** The open book's highlights, in reading order, for the reader's panel. */
export function useBookHighlights(bookId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    annotationService
      .listForBook(bookId)
      .then((list) => {
        if (!cancelled) setHighlights(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const sorted = useMemo(
    () =>
      [...highlights].sort(
        (a, b) => (spineIndexOfCfi(a.cfiRange) ?? 0) - (spineIndexOfCfi(b.cfiRange) ?? 0) || a.createdAt - b.createdAt
      ),
    [highlights]
  );

  return {
    highlights: sorted,
    added: (highlight: Highlight) => setHighlights((prev) => [...prev, highlight]),
    replaced: (highlight: Highlight) => setHighlights((prev) => prev.map((h) => (h.id === highlight.id ? highlight : h))),
    removed: (id: string) => setHighlights((prev) => prev.filter((h) => h.id !== id)),
  };
}
