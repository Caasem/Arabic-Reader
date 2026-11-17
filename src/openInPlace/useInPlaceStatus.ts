import { useCallback, useEffect, useState } from 'react';
import { getFilesBridge } from '../sync/desktopBridge';
import type { BookMeta } from '../types';
import { inPlaceHash } from './promote';

/**
 * For each book opened in place, whether its file is still where it was (`true`), or gone (`false`). Books that were
 * not opened in place are absent, and so is everything when there is no desktop app: those books are shown as books
 * without their file, as on any device that has only the record. Checked again when the window comes back to the
 * front, since a file can reappear (a drive plugged in) and `refresh` asks now.
 */
export function useInPlaceStatus(books: BookMeta[]): { found: Map<string, boolean>; refresh(): void } {
  const [found, setFound] = useState<Map<string, boolean>>(new Map());
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const files = getFilesBridge();
    if (!files) return;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    const files = getFilesBridge();
    if (!files) return;
    let live = true;
    void (async () => {
      const next = new Map<string, boolean>();
      for (const book of books) {
        const hash = book.inPlace ? inPlaceHash(book) : undefined;
        if (hash) next.set(book.id, await files.has(hash).catch(() => false));
      }
      if (live) setFound((prev) => (sameMap(prev, next) ? prev : next));
    })();
    return () => {
      live = false;
    };
  }, [books, tick]);

  return { found, refresh };
}

function sameMap(a: Map<string, boolean>, b: Map<string, boolean>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}
