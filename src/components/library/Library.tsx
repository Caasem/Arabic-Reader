import { useEffect, useMemo, useRef, useState } from 'react';
import { libraryService } from '../../library/libraryService';
import type { BookMeta } from '../../types';
import './Library.css';

const OFFLINE_NOTICE_DISMISSED_KEY = 'ar-reader-offline-notice-dismissed';

type SortOrder = 'added' | 'lastRead' | 'title' | 'progress';
type StatusFilter = 'all' | 'unread' | 'inProgress' | 'finished';

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'added', label: 'Recently added' },
  { id: 'lastRead', label: 'Recently read' },
  { id: 'title', label: 'Title' },
  { id: 'progress', label: 'Progress' },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'inProgress', label: 'In progress' },
  { id: 'unread', label: 'Unread' },
  { id: 'finished', label: 'Finished' },
];

// A book rarely reaches literal 100% (locations/percent math doesn't always
// land exactly on 1) -- close enough counts as finished for filtering.
const FINISHED_AT = 0.97;

interface ReadingInfo {
  percent: number;
  lastReadAt?: number;
}

export function Library({ onOpenBook }: { onOpenBook: (book: BookMeta) => void }) {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [readingInfo, setReadingInfo] = useState<Record<string, ReadingInfo>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOrder>('added');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // First-run notice only -- this app's biggest differentiator (a real,
  // ~136k-entry Arabic dictionary built in, no account or internet needed)
  // was otherwise completely invisible until you happened to tap a word.
  const [showOfflineNotice, setShowOfflineNotice] = useState(() => {
    try {
      return localStorage.getItem(OFFLINE_NOTICE_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });

  function dismissOfflineNotice() {
    setShowOfflineNotice(false);
    try {
      localStorage.setItem(OFFLINE_NOTICE_DISMISSED_KEY, '1');
    } catch {
      /* private-browsing or storage disabled -- the notice just reappears next time, harmless */
    }
  }

  async function refresh() {
    setLoading(true);
    const list = await libraryService.listBooks();
    setBooks(list);
    const entries = await Promise.all(list.map(async (b) => [b.id, await libraryService.readingInfoFor(b.id)] as const));
    setReadingInfo(Object.fromEntries(entries));
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
      // BASE_URL (not a literal '/') -- this runtime fetch string isn't
      // rewritten by Vite's build-time base handling the way a static
      // <script src="/..."> in index.html is, so it needs the app's actual
      // deployed base path (root locally, /<repo>/ on GitHub Pages) spelled
      // out explicitly or this 404s there.
      const res = await fetch(`${import.meta.env.BASE_URL}sample-book.epub`);
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

  // Search/filter/sort all run client-side over the already-loaded list --
  // a personal library is at most a few hundred books, so there's no real
  // cost to redoing this on every keystroke, and it keeps `refresh()` (the
  // only place that actually talks to IndexedDB) untouched by any of it.
  const visibleBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = books;
    if (q) {
      list = list.filter((b) => b.title.toLowerCase().includes(q) || (b.author ?? '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      list = list.filter((b) => {
        const percent = readingInfo[b.id]?.percent ?? 0;
        if (statusFilter === 'unread') return percent <= 0;
        if (statusFilter === 'finished') return percent >= FINISHED_AT;
        return percent > 0 && percent < FINISHED_AT; // inProgress
      });
    }

    const sorted = [...list];
    if (sortBy === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    } else if (sortBy === 'progress') {
      sorted.sort((a, b) => (readingInfo[b.id]?.percent ?? 0) - (readingInfo[a.id]?.percent ?? 0));
    } else if (sortBy === 'lastRead') {
      // Never-opened books (no lastReadAt) sink to the bottom rather than
      // clustering at the top the way `?? 0` would put them.
      sorted.sort((a, b) => (readingInfo[b.id]?.lastReadAt ?? -1) - (readingInfo[a.id]?.lastReadAt ?? -1));
    }
    // 'added' needs no re-sort -- `books` already comes back addedAt-descending from the DB.
    return sorted;
  }, [books, readingInfo, query, statusFilter, sortBy]);

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

      {showOfflineNotice && (
        <div className="library__notice">
          <span>
            This app includes a full Arabic dictionary (~136,000 entries) built in — works offline, no account, and
            nothing you read ever leaves your device. Tap any word while reading to look it up.
          </span>
          <button className="library__notice-dismiss" onClick={dismissOfflineNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {error && <div className="library__error">{error}</div>}

      {!loading && books.length > 0 && (
        <div className="library__toolbar">
          <input
            className="library__search"
            type="search"
            placeholder="Search by title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="library__filter">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                className={'library__filter-item' + (statusFilter === f.id ? ' library__filter-item--active' : '')}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select className="library__sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOrder)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="library__empty">Loading…</div>
      ) : books.length === 0 ? (
        <div className="library__empty">
          <p>No books yet.</p>
          <p className="library__empty-sub">Add an EPUB, or try the sample book to see the reader in action.</p>
        </div>
      ) : visibleBooks.length === 0 ? (
        <div className="library__empty">
          <p>No books match.</p>
          <p className="library__empty-sub">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="library__grid">
          {visibleBooks.map((book) => (
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
              {(readingInfo[book.id]?.percent ?? 0) > 0 && (
                <div className="book-card__progress">
                  <div className="book-card__progress-bar" style={{ width: `${Math.round((readingInfo[book.id]?.percent ?? 0) * 100)}%` }} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
