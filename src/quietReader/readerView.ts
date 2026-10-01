import { useCallback, useState } from 'react';
import { readString, writeString } from '../utils/storage';

/** Display -> View: read a book as clean text (the new reader) or in its original epub layout. */
export type ReaderView = 'clean' | 'original';

const key = (bookId: string) => `arabic-reader:readerView:${bookId}`;

export function loadReaderView(bookId: string): ReaderView {
  return readString(key(bookId)) === 'original' ? 'original' : 'clean';
}

/** The view for one book, remembered per book. */
export function useReaderView(bookId: string): [ReaderView, (view: ReaderView) => void] {
  const [state, setState] = useState(() => ({ bookId, view: loadReaderView(bookId) }));
  const view = state.bookId === bookId ? state.view : loadReaderView(bookId);
  const setView = useCallback(
    (next: ReaderView) => {
      writeString(key(bookId), next);
      setState({ bookId, view: next });
    },
    [bookId]
  );
  return [view, setView];
}
