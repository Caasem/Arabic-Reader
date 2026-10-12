import { useEffect, useState } from 'react';
import { libraryService } from '../../library/libraryService';
import { persistenceService } from '../../persistence';
import { chapterHtml } from '../../readerCore/chapterHtml';
import { parseCleanEpub } from '../../readerCore/parseCleanEpub';
import { openPdfPages, type OpenedPdf } from '../../pdf/pages/pdfjsLoader';
import type { BookMeta } from '../../types';
import type { LiveView } from './places';

export type LiveBook =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'text'; titles: string[]; htmls: string[] }
  | { state: 'pages'; pdf: OpenedPdf; pages: number };

/** A book for a live pane: its chapters as the reader renders them (same text offsets), or its PDF opened with pdf.js. */
export function useLiveBook(book: BookMeta | undefined, view: LiveView): LiveBook {
  const [live, setLive] = useState<{ key: string; book: LiveBook }>({ key: '', book: { state: 'loading' } });
  const key = book ? `${book.id}:${view}` : '';
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    let opened: OpenedPdf | null = null;
    const done = (b: LiveBook) => !cancelled && setLive({ key, book: b });
    (async () => {
      if (view === 'pages') {
        const file = await persistenceService.getPdfOriginal(book.id);
        if (!file) throw new Error('The PDF of this book is not on this device.');
        opened = await openPdfPages(new Uint8Array(await file.arrayBuffer()));
        if (cancelled) return void opened.destroy();
        done({ state: 'pages', pdf: opened, pages: opened.doc.numPages });
        return;
      }
      const file = await libraryService.getBookFile(book.id);
      if (!file) throw new Error('This book’s file is not on this device.');
      const parsed = await parseCleanEpub(file);
      done({ state: 'text', titles: parsed.chapters.map((c, i) => c.title || `Chapter ${i + 1}`), htmls: parsed.chapters.map((c) => chapterHtml(c, { notes: true })) });
    })().catch((e: unknown) => done({ state: 'error', message: e instanceof Error ? e.message : 'Could not open this book.' }));
    return () => {
      cancelled = true;
      void opened?.destroy();
    };
  }, [book, view, key]);
  return live.key === key ? live.book : { state: 'loading' };
}
