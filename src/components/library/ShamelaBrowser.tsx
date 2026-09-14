import { useState, type FormEvent } from 'react';
import type { ShamelaCatalogBook } from '../../shamela/types';
import { ShamelaBrowseError } from '../../shamela/types';
import { shamelaService } from '../../shamela/shamelaService';
import type { BookMeta } from '../../types';
import './ShamelaBrowser.css';

interface Props {
  onBookAdded: (book: BookMeta) => void;
  onError?: (error: Error) => void;
}

export function ShamelaBrowser({ onBookAdded, onError }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShamelaCatalogBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState('');

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setResults([]);
    try {
      const books = await shamelaService.searchBooks(query);
      setResults(books);
    } catch (error) {
      const msg = error instanceof ShamelaBrowseError
        ? `Search failed: ${error.code}`
        : 'Search failed';
      onError?.(new Error(msg));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleDownload(book: ShamelaCatalogBook) {
    setDownloadingId(book.id);
    setDownloadProgress('Starting...');

    try {
      const meta = await shamelaService.downloadBook(book, (status, percent) => {
        setDownloadProgress(`${status} (${Math.round(percent)}%)`);
      });
      onBookAdded(meta);
      setDownloadingId(null);
      setDownloadProgress('');
      setQuery('');
      setResults([]);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Download failed'));
      setDownloadingId(null);
      setDownloadProgress('');
    }
  }

  return (
    <div className="shamela-browser">
      <h2>Browse Shamela Library (Beta)</h2>

      <form onSubmit={handleSearch} className="shamela-search-form">
        <input
          type="text"
          placeholder="Search for a book..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSearching || downloadingId !== null}
        />
        <button type="submit" disabled={isSearching || downloadingId !== null || !query.trim()}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="shamela-results">
          <h3>{results.length} book(s) found</h3>
          <div className="shamela-books-list">
            {results.map((book) => (
              <div key={book.id} className="shamela-book-item">
                <div className="shamela-book-info">
                  <h4>{book.title}</h4>
                  {book.author && <p className="author">{book.author}</p>}
                  {book.description && <p className="description">{book.description}</p>}
                </div>
                <button
                  onClick={() => handleDownload(book)}
                  disabled={downloadingId !== null}
                  className="shamela-download-btn"
                >
                  {downloadingId === book.id ? '⏳' : '⬇'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {downloadingId !== null && (
        <div className="shamela-download-status">
          <div className="spinner"></div>
          <p>{downloadProgress}</p>
        </div>
      )}
    </div>
  );
}
