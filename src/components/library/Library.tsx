import { useEffect, useRef, useState } from 'react';
import { libraryService } from '../../library/libraryService';
import type { BookMeta } from '../../types';
import './Library.css';

export function Library({ onOpenBook }: { onOpenBook: (book: BookMeta) => void }) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    const list = await libraryService.listBooks();
    setBooks(list);
    const entries = await Promise.all(list.map(async (b) => [b.id, await libraryService.progressFor(b.id)] as const));
    setProgress(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.epub')) {
          setError('Only .epub files are supported right now — MOBI files are normalized to EPUB in a later phase.');
          continue;
        }
        const meta = await libraryService.importEpub(file);
        setBooks((prev) => [meta, ...prev]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that file.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function loadSample() {
    setError(null);
    setImporting(true);
    try {
      const res = await fetch('/sample-book.epub');
      const blob = await res.blob();
      const file = new File([blob], 'قرية الفتى القوي.epub', { type: 'application/epub+zip' });
      const meta = await libraryService.importEpub(file);
      setBooks((prev) => [meta, ...prev]);
    } catch {
      setError('Could not load the sample book.');
    } finally {
      setImporting(false);
    }
  }

  async function removeBook(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await libraryService.removeBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="library">
      <header className="library__header">
        <div>
          <h1>Library</h1>
          <p className="library__subtitle">Your books, all in one quiet place.</p>
        </div>
        <div className="library__actions">
          <button className="btn btn--ghost" onClick={loadSample} disabled={importing}>
            Try the sample book
          </button>
          <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Adding…' : '+ Add EPUB'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </header>

      {error && <div className="library__error">{error}</div>}

      {loading ? (
        <div className="library__empty">Loading…</div>
      ) : books.length === 0 ? (
        <div className="library__empty">
          <p>No books yet.</p>
          <p className="library__empty-sub">Add an EPUB, or try the sample book to see the reader in action.</p>
        </div>
      ) : (
        <div className="library__grid">
          {books.map((book) => (
            <button key={book.id} className="book-card" onClick={() => onOpenBook(book)}>
              <div className="book-card__cover">
                {book.coverDataUrl ? (
                  <img src={book.coverDataUrl} alt="" />
                ) : (
                  <span className="book-card__cover-fallback">{book.title.slice(0, 1)}</span>
                )}
                <span className="book-card__remove" onClick={(e) => removeBook(book.id, e)} title="Remove">
                  ×
                </span>
              </div>
              <div className="book-card__title">{book.title}</div>
              {book.author && <div className="book-card__author">{book.author}</div>}
              {(progress[book.id] ?? 0) > 0 && (
                <div className="book-card__progress">
                  <div className="book-card__progress-bar" style={{ width: `${Math.round((progress[book.id] ?? 0) * 100)}%` }} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
