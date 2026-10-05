import { useCallback, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { useChordHotkey } from '../readerChords';
import { FlashCard } from './FlashCard';

/** Mounted once beside the active reader; renders nothing when switched off. */
export function FlashHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  return prefs.flashCardEnabled ? <Active book={book} /> : null;
}

function Active({ book }: { book: BookMeta }) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useChordHotkey('KeyF', true, () => {
    if (open) return close();
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  });

  return open ? <FlashCard book={book} onClose={close} /> : null;
}
