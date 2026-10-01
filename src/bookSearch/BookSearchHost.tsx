import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { useChordHotkey } from '../readerChords';
import { BookSearchPalette } from './BookSearchPalette';
import './bookSearch.css';

/** Mounted once beside the epub reader; renders nothing when switched off. */
export function BookSearchHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  // Jumping to a match is epub-position based, which the Clean Reader has none of.
  return prefs.bookSearchEnabled && !prefs.cleanReaderEnabled ? <Active book={book} /> : null;
}

function Active({ book }: { book: BookMeta }) {
  const [open, setOpen] = useState<{ query: string } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useChordHotkey('KeyS', true, (selection) => {
    if (open) return close();
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen({ query: selection });
  });

  // Escape from inside the book reaches the host window (see Reader.tsx).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <>
      <div className="bsearch-backdrop" onClick={close} />
      <div className="bsearch" role="dialog" aria-label="Search this book">
        <BookSearchPalette book={book} initialQuery={open.query} onClose={close} />
      </div>
    </>
  );
}
