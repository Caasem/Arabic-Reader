import { useEffect, useRef, useState } from 'react';
import { DuplicateBookError, libraryService } from '../library/libraryService';
import { notifyLibraryChanged } from '../library/libraryChanged';
import { usePreferences } from '../state/PreferencesContext';
import { getFilesBridge } from '../sync/desktopBridge';

/**
 * Mounted once in the main window. Ctrl+O (Cmd+O) opens the file dialog, and files the OS handed over that need the
 * ordinary import (MOBI, AZW3, TXT, Markdown) are imported here, with a short note when done.
 */
export function OpenInPlaceHost() {
  const { prefs } = usePreferences();
  const [note, setNote] = useState<string | null>(null);
  const pdfConvert = useRef(prefs.pdfConvertToText);
  useEffect(() => {
    pdfConvert.current = prefs.pdfConvertToText;
  }, [prefs.pdfConvertToText]);

  useEffect(() => {
    const files = getFilesBridge();
    if (!files) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'o' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      void files.open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const files = getFilesBridge();
    if (!files) return;
    let busy = false;
    async function take() {
      if (!files || busy) return;
      busy = true;
      try {
        const tokens = await files.takeImports();
        const added: string[] = [];
        const failed: string[] = [];
        for (const token of tokens) {
          try {
            const info = await files.describe(token);
            const bytes = await files.read(token);
            const { meta } = await libraryService.importBook(new File([bytes as Uint8Array<ArrayBuffer>], info.name), { pdfConvert: pdfConvert.current });
            added.push(meta.title);
          } catch (e) {
            failed.push(e instanceof DuplicateBookError ? e.message : e instanceof Error ? e.message : 'A file could not be added.');
          }
        }
        if (tokens.length > 0) {
          notifyLibraryChanged();
          setNote([added.length ? `Added ${added.length === 1 ? `“${added[0]}”` : `${added.length} books`} to your library.` : '', ...failed].filter(Boolean).join(' '));
        }
      } finally {
        busy = false;
      }
    }
    void take();
    return files.onImports(() => void take());
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 8000);
    return () => window.clearTimeout(t);
  }, [note]);

  return note ? (
    <div className="oip-toast" role="status">
      {note}
    </div>
  ) : null;
}
