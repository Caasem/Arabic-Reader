import { useEffect, useState } from 'react';
import { onLibraryChanged } from '../library/libraryChanged';
import { persistenceService } from '../persistence';
import type { BookMeta } from '../types';
import { addToLibrary } from './promote';

/** In the reader's header, for a book opened in place: copies the file into the library. Nothing for any other book. */
export function AddToLibraryButton({ book }: { book: BookMeta }) {
  const [inPlace, setInPlace] = useState(book.inPlace === true);
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  // The book's own mark can change under the reader (another window added it).
  useEffect(() => {
    let live = true;
    const read = () => void persistenceService.getBook(book.id).then((b) => live && setInPlace(b?.inPlace === true));
    read();
    const off = onLibraryChanged(read);
    return () => {
      live = false;
      off();
    };
  }, [book.id]);

  if (!inPlace) return null;
  return (
    <button
      type="button"
      className="qr-pill-btn oip-add"
      disabled={state === 'working'}
      title={state === 'failed' ? message : 'Keep a copy of this book in your library'}
      onClick={() => {
        setState('working');
        addToLibrary(book).then(
          () => setState('idle'),
          (e) => {
            setMessage(e instanceof Error ? e.message : 'Could not add it.');
            setState('failed');
          }
        );
      }}
    >
      {state === 'working' ? 'Adding…' : state === 'failed' ? 'Could not add' : 'Add to library'}
    </button>
  );
}
