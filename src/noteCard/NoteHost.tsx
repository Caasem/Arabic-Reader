import { useCallback, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { useChordHotkey } from '../readerChords';
import { NoteCard } from './NoteCard';

/** Mounted once beside the active reader; renders nothing when switched off. */
export function NoteHost() {
  const { prefs } = usePreferences();
  return prefs.noteCardEnabled ? <Active /> : null;
}

function Active() {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, []);

  useChordHotkey('KeyN', true, () => {
    if (open) return close();
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  });

  return open ? <NoteCard onClose={close} /> : null;
}
