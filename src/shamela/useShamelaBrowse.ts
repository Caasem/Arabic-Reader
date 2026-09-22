import { useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { shamelaService } from './shamelaService';
import type { ShamelaCatalogBook } from './types';
import { ShamelaBrowseError } from './types';

const SEARCH_DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 2;

interface UseShamelaBrowseResult {
  results: ShamelaCatalogBook[];
  searching: boolean;
  downloadingId: number | null;
  downloadProgress: string;
  download: (book: ShamelaCatalogBook) => void;
}

/**
 * Debounced Shamela catalog search driven by the library's own search box,
 * so one query both filters local books and looks up remote ones.
 */
export function useShamelaBrowse(
  query: string,
  enabled: boolean,
  onBookAdded: (book: BookMeta) => void,
  onError: (error: Error) => void
): UseShamelaBrowseResult {
  const [results, setResults] = useState<ShamelaCatalogBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    const id = ++requestId.current;
    setSearching(true);
    const handle = setTimeout(() => {
      shamelaService
        .searchBooks(q)
        .then((books) => {
          if (requestId.current !== id) return;
          setResults(books);
        })
        .catch((error: unknown) => {
          if (requestId.current !== id) return;
          setResults([]);
          const msg =
            error instanceof ShamelaBrowseError ? `Shamela search failed: ${error.code}` : 'Shamela search failed';
          onError(new Error(msg));
        })
        .finally(() => {
          if (requestId.current === id) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError/onBookAdded read fresh via closures, not re-run triggers
  }, [query, enabled]);

  function download(book: ShamelaCatalogBook) {
    setDownloadingId(book.id);
    setDownloadProgress('Starting…');
    shamelaService
      .downloadBook(book, (status, percent) => {
        setDownloadProgress(`${status} (${Math.round(percent)}%)`);
      })
      .then((meta) => onBookAdded(meta))
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error('Download failed'));
      })
      .finally(() => {
        setDownloadingId(null);
        setDownloadProgress('');
      });
  }

  return { results, searching, downloadingId, downloadProgress, download };
}
