import { useCallback, useState } from 'react';
import type { BookMeta } from '../../types';
import { readString, writeString } from '../../utils/storage';

/** How a book added from a PDF is shown: the reflowed text, or the PDF's own pages. */
export type PdfView = 'text' | 'pages';

const viewKey = (bookId: string) => `arabic-reader:pdfView:${bookId}`;
const pageKey = (bookId: string) => `arabic-reader:pdfPage:${bookId}`;

/** The view for a book: its remembered choice, else pages when the text could not be reflowed. */
export function loadPdfView(book: BookMeta): PdfView {
  if (!book.pdf) return 'text';
  if (book.pdf.reflow !== 'ok') return 'pages';
  return readString(viewKey(book.id)) === 'pages' ? 'pages' : 'text';
}

export function usePdfView(book: BookMeta): [PdfView, (view: PdfView) => void] {
  const [state, setState] = useState(() => ({ id: book.id, view: loadPdfView(book) }));
  const view = state.id === book.id ? state.view : loadPdfView(book);
  const setView = useCallback(
    (next: PdfView) => {
      writeString(viewKey(book.id), next);
      setState({ id: book.id, view: next });
    },
    [book.id]
  );
  return [book.pdf && book.pdf.reflow !== 'ok' ? 'pages' : view, setView];
}

/** The last page read in the pages view (1-based). Kept apart from the reflowed text's position. */
export function loadPdfPage(bookId: string): number {
  const n = Number(readString(pageKey(bookId)));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function savePdfPage(bookId: string, page: number): void {
  writeString(pageKey(bookId), String(page));
}
