import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { useChordHotkey } from '../readerChords';
import { PicksExportPanel } from './PicksExportPanel';
import './picksExport.css';

/** Mounted once beside the active reader. Alt+P opens the panel; Alt+P again or Esc closes it. */
export function PicksExportHost({ book }: { book: BookMeta }) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useChordHotkey('KeyP', true, () => {
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

  return open ? <PicksExportPanel book={book} onClose={close} /> : null;
}
