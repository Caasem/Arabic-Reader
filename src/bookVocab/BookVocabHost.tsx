import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { useChordHotkey } from '../readerChords';
import { BookVocabDrawer } from './BookVocabDrawer';
import './bookVocab.css';

/** Mounted once beside the active reader; renders nothing when switched off. */
export function BookVocabHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  return prefs.bookVocabEnabled ? <Active book={book} /> : null;
}

function Active({ book }: { book: BookMeta }) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useChordHotkey('KeyV', true, () => {
    if (open) return close();
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  });

  // Escape from inside the book reaches the host window (see Reader.tsx).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return open ? <BookVocabDrawer book={book} onClose={close} /> : null;
}
