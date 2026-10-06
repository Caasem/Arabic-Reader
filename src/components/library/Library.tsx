import { hiddenDuplicateIds } from '../../library/duplicates';
import { useEffect, useMemo, useRef, useState } from 'react';
import { libraryService, type BookReadingInfo } from '../../library/libraryService';
import { LibraryHero } from '../../look';
import { preloadStarterBooks } from '../../onboarding';
import { invalidateBookVocabIndex } from '../../vocabRarity/bookVocabIndex';
import { invalidateTokenStream } from '../../speedReader';
import { useShamelaBrowse } from '../../shamela/useShamelaBrowse';
import type { BookMeta } from '../../types';
import { readString, STORAGE_KEYS, writeString } from '../../utils/storage';
import { useEscapeKey } from '../shared/useEscapeKey';
import { usePreferences } from '../../state/PreferencesContext';
import { ShamelaResultCard } from './ShamelaResultCard';
import { formatOf, IMPORTABLE_EXTENSIONS } from '../../importFormats';
import './Library.css';

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

type ReadingInfo = BookReadingInfo;

async function loadLibrary(): Promise<{ list: BookMeta[]; info: Record<string, ReadingInfo>; files: Set<string> }> {
  const list = await libraryService.listBooks();
  const [info, files] = await Promise.all([
    libraryService.readingInfoForBooks(list.map((b) => b.id)),
    libraryService.listBookFileIds(),
  ]);
  return { list, info, files };
}

export function Library({ onOpenBook }: { onOpenBook: (book: BookMeta) => void }) {
  const { prefs } = usePreferences();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [readingInfo, setReadingInfo] = useState<Record<string, ReadingInfo>>({});
  // Which books have their file on this device. A book that arrived through sync
  // has its details but not its file until the user adds it. Null until known.
  const [fileIds, setFileIds] = useState<Set<string> | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Converting <name>…" while a non-EPUB file is turned into an EPUB, then a short report.
  const [importLabel, setImportLabel] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    if (!importReport) return;
    const t = window.setTimeout(() => setImportReport(null), 10000);
    return () => window.clearTimeout(t);
  }, [importReport]);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOrder>('added');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Removing a book deletes its file and reading position outright (see
  // libraryService.removeBook) -- confirmed first since that's irreversible.
  const [confirmRemoveBook, setConfirmRemoveBook] = useState<BookMeta | null>(null);
  useEscapeKey(() => setConfirmRemoveBook(null), !!confirmRemoveBook);
  // First-run notice only -- this app's biggest differentiator (a real,
  // ~136k-entry Arabic dictionary built in, no account or internet needed)
  // was otherwise completely invisible until you happened to tap a word.
  const [showOfflineNotice, setShowOfflineNotice] = useState(
    () => readString(STORAGE_KEYS.offlineNoticeDismissed) !== '1'
  );

  function dismissOfflineNotice() {
    setShowOfflineNotice(false);
    writeString(STORAGE_KEYS.offlineNoticeDismissed, '1');
  }

  function reloadLibrary() {
    loadLibrary().then(({ list, info, files }) => {
      setBooks(list);
      setReadingInfo(info);
      setFileIds(files);
    });
  }

  useEffect(() => {
    let cancelled = false;
    // The starter book goes on the shelf before the first listing, once.
    preloadStarterBooks().then(loadLibrary).then(({ list, info, files }) => {
      if (cancelled) return;
      setBooks(list);
      setReadingInfo(info);
      setFileIds(files);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleShamelaBookAdded() {
    reloadLibrary();
    setError(null);
  }

  function handleShamelaBrowseError(err: Error) {
    setError(err.message);
  }

  const shamela = useShamelaBrowse(query, prefs.shamelaEnabled, handleShamelaBookAdded, handleShamelaBrowseError);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);
    setImporting(true);
    try {
      const reports: string[] = [];
      const failures: string[] = [];
      for (const file of Array.from(files)) {
        const format = formatOf(file.name);
        setImportLabel(format && format !== 'epub' ? `Converting ${file.name}…` : null);
        try {
          const { meta, converted } = await libraryService.importBook(file);
          setBooks((prev) => [meta, ...prev]);
          setFileIds((prev) => (prev ? new Set(prev).add(meta.id) : prev));
          if (converted) {
            const chapters = `${converted.chapters} chapter${converted.chapters === 1 ? '' : 's'}`;
            reports.push(`"${meta.title}": converted from ${converted.format.toUpperCase()} · ${chapters}${converted.warnings.length ? ` (${converted.warnings.join('; ')})` : ''}`);
          }
        } catch (e) {
          failures.push(e instanceof Error ? e.message : `Could not add "${file.name}".`);
        }
      }
      if (reports.length) setImportReport(reports.join(' · '));
      if (failures.length) setError(failures.join(' '));
    } finally {
      setImporting(false);
      setImportLabel(null);
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
      setFileIds((prev) => (prev ? new Set(prev).add(meta.id) : prev));
    } catch {
      setError('Could not load the sample book.');
    } finally {
      setImporting(false);
    }
  }

  const isMissingFile = (book: BookMeta) => fileIds !== null && !fileIds.has(book.id);

  /** Open a book, unless its file isn't on this device yet. */
  function openBook(book: BookMeta) {
    if (isMissingFile(book)) {
      setError(`"${book.title}" came from another device and its file isn't here yet. Use "Add file" on its card.`);
      return;
    }
    onOpenBook(book);
  }

  function askForFile(book: BookMeta) {
    attachTargetRef.current = book.id;
    attachInputRef.current?.click();
  }

  async function handleAttach(files: FileList | null) {
    const id = attachTargetRef.current;
    const file = files?.[0];
    attachTargetRef.current = null;
    if (attachInputRef.current) attachInputRef.current.value = '';
    if (!id || !file) return;
    setError(null);
    try {
      await libraryService.attachBookFile(id, file);
      setFileIds((prev) => new Set(prev ?? []).add(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that file.');
    }
  }

  function requestRemoveBook(book: BookMeta, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmRemoveBook(book);
  }

  async function confirmRemoveBookNow() {
    const book = confirmRemoveBook;
    if (!book) return;
    setConfirmRemoveBook(null);
    await libraryService.removeBook(book.id);
    invalidateBookVocabIndex(book.id);
    invalidateTokenStream(book.id);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
  }

  // Search/filter/sort all run client-side over the already-loaded list --
  // a personal library is at most a few hundred books, so there's no real
  // cost to redoing this on every keystroke, and it keeps `refresh()` (the
  // only place that actually talks to IndexedDB) untouched by any of it.
  const hiddenStubs = useMemo(() => hiddenDuplicateIds(books, fileIds), [books, fileIds]);
  const shelfBooks = useMemo(() => books.filter((b) => !hiddenStubs.has(b.id)), [books, hiddenStubs]);

  const visibleBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = shelfBooks;
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
  }, [shelfBooks, readingInfo, query, statusFilter, sortBy]);

  return (
    <div
      className={'library' + (dropping ? ' library--drop' : '')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      {/* "Add file" for a book whose file is on another device. Kept out of the header's
          actions so that row has a single file input (the import). */}
      <input
        ref={attachInputRef}
        type="file"
        accept=".epub"
        hidden
        aria-label="Choose the file for this book"
        onChange={(e) => handleAttach(e.target.files)}
      />
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
            {importing ? 'Adding…' : '+ Add book'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMPORTABLE_EXTENSIONS.join(',')}
            aria-label="Add books (EPUB, TXT, Markdown, MOBI, AZW3)"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </header>

      {!loading && <LibraryHero books={shelfBooks} readingInfo={readingInfo} onOpen={openBook} />}

      {showOfflineNotice && (
        <div className="library__notice">
          <span>
            <span className="library__notice-version">V{__APP_VERSION__}</span> This app includes a full Arabic
            dictionary (~136,000 entries) built in — works offline, no account, and nothing you read ever leaves your
            device. Tap any word while reading to look it up.
          </span>
          <button className="library__notice-dismiss" onClick={dismissOfflineNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {importLabel && (
        <div className="library__notice" role="status">
          {importLabel}
        </div>
      )}
      {importReport && (
        <div className="library__notice" role="status">
          {importReport}
        </div>
      )}
      {error && <div className="library__error">{error}</div>}

      {!loading && (books.length > 0 || prefs.shamelaEnabled) && (
        <div className="library__toolbar">
          <input
            className="library__search"
            type="search"
            placeholder={prefs.shamelaEnabled ? 'Search your library or Shamela…' : 'Search by title or author…'}
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

      {!loading && prefs.shamelaEnabled && (
        <p className="library__shamela-note">
          Also searching an unofficial Shamela mirror (not shamela.ws) — results not yet in your library show ⬇.
        </p>
      )}

      {loading ? (
        <div className="library__empty">Loading…</div>
      ) : visibleBooks.length === 0 && shamela.results.length === 0 && !shamela.searching ? (
        shelfBooks.length === 0 && !query.trim() ? (
          <div className="library__empty">
            <p>No books yet.</p>
            <p className="library__empty-sub">Add a book (EPUB, TXT, Markdown, MOBI or AZW3) or drop one here, or try the sample book to see the reader in action.</p>
          </div>
        ) : (
          <div className="library__empty">
            <p>No books match.</p>
            <p className="library__empty-sub">Try a different search or filter.</p>
          </div>
        )
      ) : (
        <div className="library__grid">
          {visibleBooks.map((book) => (
            <div key={book.id} className={'book-card' + (isMissingFile(book) ? ' book-card--missing' : '')}>
              <button className="book-card__open" onClick={() => openBook(book)}>
                <div className="book-card__cover">
                  {book.coverDataUrl ? (
                    <img src={book.coverDataUrl} alt="" />
                  ) : (
                    <span className="book-card__cover-fallback">{book.title.slice(0, 1)}</span>
                  )}
                </div>
                <div className="book-card__title">{book.title}</div>
                {book.author && <div className="book-card__author">{book.author}</div>}
                {isMissingFile(book) && <div className="book-card__missing">File not on this device</div>}
                {(readingInfo[book.id]?.percent ?? 0) > 0 && (
                  <div className="book-card__progress">
                    <div
                      className="book-card__progress-bar"
                      style={{ width: `${Math.round((readingInfo[book.id]?.percent ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
              </button>
              {isMissingFile(book) && (
                <button className="btn btn--ghost book-card__add-file" onClick={() => askForFile(book)}>
                  Add file
                </button>
              )}
              <button
                className="book-card__remove"
                onClick={(e) => requestRemoveBook(book, e)}
                aria-label={`Remove ${book.title}`}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          {prefs.shamelaEnabled &&
            shamela.results.map((book) => (
              <ShamelaResultCard
                key={`shamela-${book.id}`}
                book={book}
                downloading={shamela.downloadingId === book.id}
                progress={shamela.downloadProgress}
                onDownload={shamela.download}
              />
            ))}
        </div>
      )}

      {confirmRemoveBook && (
        <div className="library__confirm-backdrop" onClick={() => setConfirmRemoveBook(null)}>
          <div
            className="library__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="library-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="library-confirm-title">Remove this book?</h2>
            <p dir="auto">
              “{confirmRemoveBook.title}” and its reading position will be removed from this device. Any saved
              vocabulary and highlights from it are kept.
            </p>
            <div className="library__confirm-actions">
              <button className="btn btn--ghost" onClick={() => setConfirmRemoveBook(null)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={() => void confirmRemoveBookNow()} autoFocus>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
