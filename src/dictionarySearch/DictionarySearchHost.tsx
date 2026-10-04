import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, ReaderPreferences } from '../types';
import { SearchBody } from './SearchBody';
import { Shell } from './Shell';
import { useSearchHotkey } from './useSearchHotkey';
import './dictionarySearch.css';

const NARROW_QUERY = '(max-width: 600px)';

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** Mounted once beside the active reader; renders nothing when switched off. */
export function DictionarySearchHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  return prefs.dictionarySearchEnabled ? <Active book={book} style={prefs.dictionarySearchStyle} /> : null;
}

function Active({ book, style }: { book: BookMeta; style: ReaderPreferences['dictionarySearchStyle'] }) {
  const [open, setOpen] = useState<{ query: string } | null>(null);
  const narrow = useIsNarrow();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useSearchHotkey(true, (selection) => {
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
    <Shell style={narrow ? 'sheet' : style} onClose={close}>
      <SearchBody book={book} initialQuery={open.query} onClose={close} />
    </Shell>
  );
}
