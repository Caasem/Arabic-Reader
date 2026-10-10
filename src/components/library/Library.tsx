import { hiddenDuplicateIds } from '../../library/duplicates';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DuplicateBookError, libraryService } from '../../library/libraryService';
import { onLibraryChanged } from '../../library/libraryChanged';
import { pickContinueBook } from '../../look/continueBook';
import { preloadStarterBooks } from '../../onboarding';
import { invalidateBookVocabIndex } from '../../vocabRarity/bookVocabIndex';
import { invalidateTokenStream } from '../../speedReader';
import { useShamelaBrowse } from '../../shamela/useShamelaBrowse';
import type { BookMeta, Highlight, LibrarySort } from '../../types';
import { useEscapeKey } from '../shared/useEscapeKey';
import type { ViewName } from '../shared/NavBar';
import { usePreferences } from '../../state/PreferencesContext';
import { ShamelaResultCard } from './ShamelaResultCard';
import { BrowseLibraryPanel } from '../../browseLibrary/BrowseLibraryPanel';
import { NextVolumes } from '../../browseLibrary/NextVolumes';
import { formatOf, IMPORTABLE_EXTENSIONS } from '../../importFormats';
import { highlightsMarkdown } from '../../dataExport/highlightsMd';
import { saveFile } from '../../utils/saveFile';
import { hasPdfChoice, rememberPdfView, type PdfView } from '../../pdf/pages/pdfView';
import { BookCover } from './BookCover';
import { BookDetails } from './BookDetails';
import { ContinueReading } from './ContinueReading';
import { HabitsRow } from './HabitsRow';
import { QuoteCard } from './QuoteCard';
import { activeMsOnDay, bookStatus, hijriDate, relativeDay, shelveBooks, statsByBook, type ReadingInfo, type StatusFilter } from './libraryInsights';
import { addShelf, deleteShelf, forgetBook, renameShelf, toggleBookOnShelf } from './shelves';
import { useLibraryInsights } from './useLibraryInsights';
import './Library.css';
import './libraryRedesign.css';

const SORT_OPTIONS: { id: LibrarySort; label: string }[] = [
  { id: 'lastRead', label: 'Recently read' },
  { id: 'added', label: 'Recently added' },
  { id: 'title', label: 'Title' },
  { id: 'progress', label: 'Progress' },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading' },
  { id: 'unread', label: 'Unread' },
  { id: 'finished', label: 'Finished' },
];

async function loadLibrary(): Promise<{ list: BookMeta[]; info: Record<string, ReadingInfo>; files: Set<string> }> {
  const list = await libraryService.listBooks();
  const [info, files] = await Promise.all([
    libraryService.readingInfoForBooks(list.map((b) => b.id)),
    libraryService.listBookFileIds(),
  ]);
  return { list, info, files };
}

/** Removing a book, or only its file: both confirmed first. */
type Confirm = { kind: 'remove' | 'freeSpace'; book: BookMeta };

/** Typing in the shelf row: a new shelf's name, or a new name for the open shelf. */
type ShelfEdit = { mode: 'new' | 'rename'; value: string };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

const DOTS = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

export function Library({ onOpenBook, onNavigate }: { onOpenBook: (book: BookMeta, cfi?: string) => void; onNavigate?: (view: ViewName) => void }) {
  const { prefs, updatePrefs } = usePreferences();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [readingInfo, setReadingInfo] = useState<Record<string, ReadingInfo>>({});
  // Which books have their file on this device. A book that arrived through sync
  // has its details but not its file until the user adds it. Null until known.
  const [fileIds, setFileIds] = useState<Set<string> | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [shelfEdit, setShelfEdit] = useState<ShelfEdit | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Removing a book deletes its file and reading position outright (see
  // libraryService.removeBook) -- confirmed first since that's irreversible.
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [browsing, setBrowsing] = useState(false);
  useEscapeKey(() => setConfirm(null), !!confirm);
  // Bumped whenever the books change, so highlights, words and sessions reload with them.
  const [insightsKey, setInsightsKey] = useState(0);
  const { insights } = useLibraryInsights(insightsKey);

  function reloadLibrary() {
    loadLibrary().then(({ list, info, files }) => {
      setBooks(list);
      setReadingInfo(info);
      setFileIds(files);
      setInsightsKey((k) => k + 1);
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

  // The Storage screen (Settings) can remove a file or a book while this stays mounted underneath.
  useEffect(() => onLibraryChanged(reloadLibrary), []);

  // "/" jumps to the search box, as on most sites with one.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
        setImportLabel(format === 'pdf' && !prefs.pdfConvertToText ? `Adding ${file.name}…` : format && format !== 'epub' ? `Converting ${file.name}…` : null);
        try {
          const { meta, converted } = await libraryService.importBook(file, { pdfConvert: prefs.pdfConvertToText });
          // A file that completed a synced book keeps that book's id: replace it rather than list it twice.
          setBooks((prev) => [meta, ...prev.filter((b) => b.id !== meta.id)]);
          setFileIds((prev) => (prev ? new Set(prev).add(meta.id) : prev));
          if (converted) {
            const size = converted.pages ? `${converted.pages} page${converted.pages === 1 ? '' : 's'}` : `${converted.chapters} chapter${converted.chapters === 1 ? '' : 's'}`;
            const what = converted.reflow && converted.reflow !== 'ok' ? 'added as PDF pages' : `converted from ${converted.format.toUpperCase()}`;
            reports.push(`"${meta.title}": ${what} · ${size}${converted.warnings.length ? ` (${converted.warnings.join('; ')})` : ''}`);
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
      setBooks((prev) => [meta, ...prev.filter((b) => b.id !== meta.id)]);
      setFileIds((prev) => (prev ? new Set(prev).add(meta.id) : prev));
    } catch (e) {
      setError(e instanceof DuplicateBookError ? e.message : 'Could not load the sample book.');
    } finally {
      setImporting(false);
    }
  }

  const isMissingFile = (book: BookMeta) => fileIds !== null && !fileIds.has(book.id);

  /** Open a book, unless its file isn't on this device yet. */
  function openBook(book: BookMeta, cfi?: string) {
    if (isMissingFile(book)) {
      setError(`"${book.title}" came from another device and its file isn't here yet. Use "Add file" on its card.`);
      return;
    }
    onOpenBook(book, cfi);
  }

  /** A PDF book's own pages or its reflowed text: remembered for the book, then opened. */
  function openBookAs(book: BookMeta, view: PdfView) {
    rememberPdfView(book.id, view);
    openBook(book);
  }

  /** Books that arrived from Browse library: onto the shelf now, without waiting for the next listing. */
  function handleBrowseAdded(added: BookMeta[]) {
    const ids = new Set(added.map((b) => b.id));
    setBooks((prev) => [...added, ...prev.filter((b) => !ids.has(b.id))]);
    setFileIds((prev) => (prev ? new Set([...prev, ...ids]) : prev));
  }

  function openHighlight(h: Highlight) {
    const book = books.find((b) => b.id === h.bookId);
    if (!book) {
      setError(`"${h.bookTitle}" is no longer in your library, so this highlight can't open in it. It's still in Highlights.`);
      return;
    }
    openBook(book, h.cfiRange);
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

  async function confirmNow() {
    const c = confirm;
    if (!c) return;
    setConfirm(null);
    setDetailsId(null);
    if (c.kind === 'freeSpace') {
      // Raises onLibraryChanged, which reloads the shelf.
      await libraryService.removeBookFileOnly(c.book.id);
      return;
    }
    await libraryService.removeBook(c.book.id);
    invalidateBookVocabIndex(c.book.id);
    invalidateTokenStream(c.book.id);
    setBooks((prev) => prev.filter((b) => b.id !== c.book.id));
    const shelves = forgetBook(prefs.libraryShelves, c.book.id);
    if (shelves !== prefs.libraryShelves) updatePrefs({ libraryShelves: shelves });
  }

  async function exportHighlights(book: BookMeta, highlights: Highlight[]) {
    try {
      await saveFile(`${book.title.replace(/[\\/:*?"<>|]+/g, ' ').trim()} highlights.md`, highlightsMarkdown(highlights), 'text/markdown');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export the highlights.');
    }
  }

  function commitShelfEdit() {
    const edit = shelfEdit;
    setShelfEdit(null);
    if (!edit) return;
    if (edit.mode === 'new') {
      const { shelves, shelf } = addShelf(prefs.libraryShelves, edit.value);
      if (shelf) {
        updatePrefs({ libraryShelves: shelves });
        setShelfId(shelf.id);
      }
    } else if (shelfId) {
      updatePrefs({ libraryShelves: renameShelf(prefs.libraryShelves, shelfId, edit.value) });
    }
  }

  function shelfEditKeys(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitShelfEdit();
    if (e.key === 'Escape') {
      e.stopPropagation();
      setShelfEdit(null);
    }
  }

  function removeOpenShelf() {
    if (!shelfId) return;
    updatePrefs({ libraryShelves: deleteShelf(prefs.libraryShelves, shelfId) });
    setShelfId(null);
  }

  // Search/filter/sort all run client-side over the already-loaded list --
  // a personal library is at most a few hundred books.
  const hiddenStubs = useMemo(() => hiddenDuplicateIds(books, fileIds), [books, fileIds]);
  const shelfBooks = useMemo(() => books.filter((b) => !hiddenStubs.has(b.id)), [books, hiddenStubs]);
  const openShelf = prefs.libraryShelves.find((s) => s.id === shelfId);
  const visibleBooks = useMemo(
    () =>
      shelveBooks(shelfBooks, readingInfo, insights.highlights, {
        query,
        status: statusFilter,
        onlyIds: openShelf ? new Set(openShelf.bookIds) : undefined,
        sort: prefs.librarySort,
      }),
    [shelfBooks, readingInfo, insights.highlights, query, statusFilter, openShelf, prefs.librarySort]
  );
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: shelfBooks.length, reading: 0, unread: 0, finished: 0 };
    for (const b of shelfBooks) c[bookStatus(readingInfo[b.id]?.percent)]++;
    return c;
  }, [shelfBooks, readingInfo]);
  const stats = useMemo(() => statsByBook(insights.highlights, insights.vocabulary, insights.sessions), [insights]);
  const shelfIds = useMemo(() => new Set(shelfBooks.map((b) => b.id)), [shelfBooks]);

  const heroBook = pickContinueBook(shelfBooks, readingInfo);
  const alsoReading = shelfBooks
    .filter((b) => b.id !== heroBook?.id && bookStatus(readingInfo[b.id]?.percent) === 'reading')
    .sort((a, b) => (readingInfo[b.id]?.lastReadAt ?? 0) - (readingInfo[a.id]?.lastReadAt ?? 0))
    .slice(0, 2)
    .map((b) => ({ book: b, percent: readingInfo[b.id]?.percent ?? 0 }));
  const showQuote = prefs.libraryShowQuote && (insights.highlights.length > 0 || !!heroBook);
  const detailsBook = detailsId ? books.find((b) => b.id === detailsId) : undefined;
  const detailsHighlights = detailsBook ? insights.highlights.filter((h) => h.bookId === detailsBook.id) : [];
  const today = new Date();
  const hijri = hijriDate(today.getTime());
  const viewList = prefs.libraryView === 'list';
  const totalWords = insights.vocabulary.length;

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
        <div className="library__heading">
          <div className="library__date">
            {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            {hijri && (
              <>
                {' · '}
                <span dir="rtl" lang="ar">
                  {hijri}
                </span>
              </>
            )}
          </div>
          <h1>Your library</h1>
        </div>
        {!loading && (books.length > 0 || prefs.shamelaEnabled) && (
          <div className="library__search-wrap">
            <svg className="library__search-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              className="library__search"
              type="search"
              aria-label="Search your library"
              placeholder={prefs.shamelaEnabled ? 'Search titles, authors, highlights or Shamela…' : 'Search titles, authors, highlights…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {!query && (
              <kbd className="library__search-key" aria-hidden="true">
                /
              </kbd>
            )}
          </div>
        )}
        <div className="library__actions">
          <button className="btn btn--ghost" onClick={() => setBrowsing(true)}>
            Browse library
          </button>
          <button className="btn btn--ghost" onClick={loadSample} disabled={importing}>
            Try the sample book
          </button>
          <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Adding…' : '+ Add books'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMPORTABLE_EXTENSIONS.join(',')}
            aria-label="Add books (EPUB, PDF, TXT, Markdown, MOBI, AZW3)"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </header>

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
      {error && (
        <div className="library__error" role="alert">
          <span>{error}</span>
          <button type="button" className="library__error-dismiss" aria-label="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {!loading && (heroBook || showQuote) && (
        <section className={'lib-today' + (heroBook && showQuote ? '' : ' lib-today--single')} aria-label="Today">
          {heroBook && (
            <ContinueReading
              book={heroBook}
              info={readingInfo[heroBook.id]}
              sessions={insights.sessions.filter((s) => s.bookId === heroBook.id)}
              alsoReading={alsoReading}
              onOpen={(b) => openBook(b)}
              onDetails={(b) => setDetailsId(b.id)}
            />
          )}
          {showQuote && <QuoteCard highlights={insights.highlights} onOpen={openHighlight} />}
        </section>
      )}

      {!loading && prefs.libraryShowHabits && books.length > 0 && (
        <HabitsRow
          streak={insights.streak}
          activeDays={insights.activeDays}
          todayMs={activeMsOnDay(insights.sessions)}
          goalMinutes={prefs.dailyGoalMinutes}
          onGoalChange={(m) => updatePrefs({ dailyGoalMinutes: m })}
          vocabulary={insights.vocabulary}
          dueCount={insights.dueCount}
          onOpenStats={() => onNavigate?.('dashboard')}
          onOpenVocabulary={() => onNavigate?.('vocabulary')}
          onReview={() => onNavigate?.('review')}
        />
      )}

      {!loading && prefs.shamelaEnabled && (
        <p className="library__shamela-note">
          Also searching an unofficial Shamela mirror (not shamela.ws) — results not yet in your library show ⬇.
        </p>
      )}

      {loading ? (
        <div className="library__empty">Loading…</div>
      ) : shelfBooks.length === 0 && !query.trim() ? (
        <div className="library__empty library__empty--first">
          <p className="library__empty-title">Your shelf is empty</p>
          <p className="library__empty-sub">
            Add a book (EPUB, PDF, TXT, Markdown, MOBI or AZW3) or drop one anywhere here, browse the open collections, or
            try the sample book to see the reader in action.
          </p>
        </div>
      ) : (
        <section className="lib-shelf" aria-labelledby="lib-shelf-title">
          <div className="lib-shelf__head">
            <div>
              {shelfEdit?.mode === 'rename' ? (
                <input
                  className="lib-shelf__rename"
                  aria-label="Shelf name"
                  autoFocus
                  value={shelfEdit.value}
                  onChange={(e) => setShelfEdit({ mode: 'rename', value: e.target.value })}
                  onKeyDown={shelfEditKeys}
                  onBlur={commitShelfEdit}
                />
              ) : (
                <h2 id="lib-shelf-title" className="lib-section-title">
                  {openShelf ? openShelf.name : 'All books'}
                </h2>
              )}
              <div className="lib-shelf__sub">
                {visibleBooks.length} {visibleBooks.length === 1 ? 'book' : 'books'}
                {query.trim() && <> matching “{query.trim()}”</>}
                {!openShelf && counts.reading > 0 && <> · {counts.reading} in progress</>}
                {!openShelf && totalWords > 0 && <> · {totalWords} words saved</>}
                {openShelf && (
                  <>
                    {' · '}
                    <button type="button" className="lib-link" onClick={() => setShelfEdit({ mode: 'rename', value: openShelf.name })}>
                      Rename
                    </button>
                    {' · '}
                    <button type="button" className="lib-link" onClick={removeOpenShelf}>
                      Delete shelf
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="lib-shelf__tools">
              <label className="lib-shelf__sort">
                <span>Sort</span>
                <select className="library__sort" value={prefs.librarySort} onChange={(e) => updatePrefs({ librarySort: e.target.value as LibrarySort })}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="lib-toggle" role="group" aria-label="Layout">
                <button type="button" className="lib-icon-btn" aria-label="Grid view" aria-pressed={!viewList} onClick={() => updatePrefs({ libraryView: 'grid' })}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
                <button type="button" className="lib-icon-btn" aria-label="List view" aria-pressed={viewList} onClick={() => updatePrefs({ libraryView: 'list' })}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="lib-chips">
            {STATUS_FILTERS.map((f) => (
              <button key={f.id} type="button" className="lib-chip" aria-pressed={statusFilter === f.id} onClick={() => setStatusFilter(f.id)}>
                {f.label} <span className="lib-chip__n">{counts[f.id]}</span>
              </button>
            ))}
            <span className="lib-chips__sep" aria-hidden="true" />
            {prefs.libraryShelves.map((s) => (
              <button key={s.id} type="button" className="lib-chip" aria-pressed={shelfId === s.id} onClick={() => setShelfId(shelfId === s.id ? null : s.id)}>
                <span className="lib-dot" style={{ background: s.color }} aria-hidden="true" />
                {s.name}
                <span className="lib-chip__n">{s.bookIds.filter((id) => shelfIds.has(id)).length}</span>
              </button>
            ))}
            {shelfEdit?.mode === 'new' ? (
              <input
                className="lib-chip lib-chip--input"
                aria-label="New shelf name"
                placeholder="Shelf name, then Enter"
                autoFocus
                value={shelfEdit.value}
                onChange={(e) => setShelfEdit({ mode: 'new', value: e.target.value })}
                onKeyDown={shelfEditKeys}
                onBlur={commitShelfEdit}
              />
            ) : (
              <button type="button" className="lib-chip lib-chip--new" onClick={() => setShelfEdit({ mode: 'new', value: '' })}>
                + New shelf
              </button>
            )}
          </div>

          {openShelf && openShelf.bookIds.length === 0 && (
            <p className="lib-shelf__hint">This shelf is empty. Open a book’s details (the ⋯ by its title) and tick this shelf under “Shelves”.</p>
          )}

          {visibleBooks.length === 0 && shamela.results.length === 0 && !shamela.searching ? (
            <div className="library__empty">
              <p>No books match.</p>
              <p className="library__empty-sub">Try another word, or clear the shelf and status filters.</p>
            </div>
          ) : viewList ? (
            <div className="lib-list-wrap">
              <div className="lib-list" role="table" aria-label="Books">
                <div className="lib-list__row lib-list__row--head" role="row">
                  <span role="columnheader" />
                  <span role="columnheader">Title</span>
                  <span role="columnheader">Progress</span>
                  <span role="columnheader">Last read</span>
                  <span role="columnheader">Highlights</span>
                  <span role="columnheader">Words</span>
                  <span role="columnheader">Type</span>
                  <span role="columnheader" />
                </div>
                {visibleBooks.map((book) => {
                  const info = readingInfo[book.id];
                  const st = bookStatus(info?.percent);
                  const pct = Math.round((info?.percent ?? 0) * 100);
                  const s = stats.get(book.id);
                  const missing = isMissingFile(book);
                  return (
                    <div key={book.id} className={'lib-list__row' + (missing ? ' lib-list__row--missing' : '')} role="row">
                      <span role="cell" className="lib-list__cover">
                        <BookCover book={book} size="sm" dimmed={missing} />
                      </span>
                      <span role="cell" className="lib-list__title-cell">
                        <button type="button" className="lib-list__open" onClick={() => (missing ? askForFile(book) : openBook(book))}>
                          <span className="lib-list__title" dir="auto">
                            {book.title}
                          </span>
                          {book.author && (
                            <span className="lib-list__author" dir="auto">
                              {book.author}
                            </span>
                          )}
                          {missing && <span className="lib-list__missing">On another device · Add file</span>}
                        </button>
                      </span>
                      <span role="cell" className="lib-list__progress">
                        <span className="lib-progress">
                          <span className="lib-progress__fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="lib-list__status">{st === 'finished' ? 'Finished' : st === 'reading' ? `${pct}%` : 'Not started'}</span>
                      </span>
                      <span role="cell">{relativeDay(info?.lastReadAt)}</span>
                      <span role="cell">{s?.highlights ?? 0}</span>
                      <span role="cell">{s?.words ?? 0}</span>
                      <span role="cell" className="lib-list__fmt">
                        {hasPdfChoice(book) && !missing ? (
                          <span className="lib-open-as" role="group" aria-label={`Open ${book.title} as`}>
                            <button type="button" className="lib-open-as__btn" onClick={() => openBookAs(book, 'pages')}>
                              PDF
                            </button>
                            <button type="button" className="lib-open-as__btn" onClick={() => openBookAs(book, 'text')}>
                              Text
                            </button>
                          </span>
                        ) : (
                          book.format.toUpperCase()
                        )}
                      </span>
                      <span role="cell">
                        <button type="button" className="lib-icon-btn lib-icon-btn--quiet" aria-label={`Details for ${book.title}`} onClick={() => setDetailsId(book.id)}>
                          {DOTS}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="library__grid">
              {visibleBooks.map((book) => {
                const info = readingInfo[book.id];
                const st = bookStatus(info?.percent);
                const pct = Math.round((info?.percent ?? 0) * 100);
                const hl = stats.get(book.id)?.highlights ?? 0;
                const missing = isMissingFile(book);
                const hlText = hl ? ` · ${hl} highlight${hl === 1 ? '' : 's'}` : '';
                const meta = st === 'finished' ? `Finished${hlText}` : st === 'reading' ? `${pct}%${hlText}` : `Not started · added ${relativeDay(book.addedAt).toLowerCase()}`;
                return (
                  <div key={book.id} className={'book-card' + (missing ? ' book-card--missing' : '')}>
                    <button className="book-card__open" onClick={() => openBook(book)} aria-label={`Open ${book.title}`}>
                      <span className="book-card__cover">
                        <BookCover book={book} dimmed={missing} />
                        {book.format !== 'epub' && <span className="book-card__badge">{book.format.toUpperCase()}</span>}
                        {st === 'finished' && (
                          <span className="book-card__done" title="Finished">
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="book-card__info">
                      <div className="book-card__title-row">
                        <div className="book-card__title" dir="auto">
                          {book.title}
                        </div>
                        <button type="button" className="book-card__more" aria-label={`Details for ${book.title}`} onClick={() => setDetailsId(book.id)}>
                          {DOTS}
                        </button>
                      </div>
                      {book.author && (
                        <div className="book-card__author" dir="auto">
                          {book.author}
                        </div>
                      )}
                      {st === 'reading' && (
                        <div className="book-card__progress">
                          <div className="book-card__progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      {missing ? <div className="book-card__missing">File not on this device</div> : <div className="book-card__meta">{meta}</div>}
                      {hasPdfChoice(book) && !missing && (
                        <span className="lib-open-as" role="group" aria-label={`Open ${book.title} as`}>
                          <button type="button" className="lib-open-as__btn" onClick={() => openBookAs(book, 'pages')}>
                            PDF
                          </button>
                          <button type="button" className="lib-open-as__btn" onClick={() => openBookAs(book, 'text')}>
                            Text
                          </button>
                        </span>
                      )}
                      {missing && (
                        <button className="btn btn--ghost book-card__add-file" onClick={() => askForFile(book)}>
                          Add file
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
              {!query.trim() && !openShelf && statusFilter === 'all' && (
                <button type="button" className="lib-add-tile" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="lib-add-tile__title">Add a book</span>
                  <span className="lib-add-tile__sub">or drop EPUB, PDF, TXT, Markdown, MOBI or AZW3 anywhere</span>
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {!loading && insights.highlights.length > 1 && (
        <section className="lib-recent" aria-labelledby="lib-recent-title">
          <div className="lib-recent__head">
            <h2 id="lib-recent-title" className="lib-section-title">
              Recently highlighted
            </h2>
            <button type="button" className="lib-link" onClick={() => onNavigate?.('highlights')}>
              All {insights.highlights.length} highlights
            </button>
          </div>
          <div className="lib-recent__grid">
            {insights.highlights.slice(0, 3).map((h) => (
              <button key={h.id} type="button" className="lib-recent__card" onClick={() => openHighlight(h)}>
                <span className="lib-recent__text" dir="auto">
                  <span className={`lib-mark lib-mark--${h.color}`}>{h.text}</span>
                </span>
                <span className="lib-recent__meta">
                  <span className="lib-ar" dir="auto">
                    {h.bookTitle}
                  </span>
                  <span>{relativeDay(h.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="library__footer">
        <span>
          A full Arabic dictionary (~136,000 entries) is built in: it works offline, needs no account, and nothing you read
          leaves this device. Tap any word while reading to look it up.
        </span>
        <span className="library__notice-version">V{__APP_VERSION__}</span>
      </footer>

      {browsing && (
        <BrowseLibraryPanel
          onClose={() => setBrowsing(false)}
          onBooksAdded={handleBrowseAdded}
          ownedIds={new Set(books.map((b) => b.id))}
        />
      )}

      {detailsBook && !confirm && (
        <BookDetails
          book={detailsBook}
          info={readingInfo[detailsBook.id]}
          stats={stats.get(detailsBook.id)}
          highlights={detailsHighlights}
          shelves={prefs.libraryShelves}
          missingFile={isMissingFile(detailsBook)}
          onClose={() => setDetailsId(null)}
          onOpen={(b) => openBook(b)}
          onOpenHighlight={openHighlight}
          onStudyWords={() => onNavigate?.('vocabulary')}
          onToggleShelf={(id) => updatePrefs({ libraryShelves: toggleBookOnShelf(prefs.libraryShelves, id, detailsBook.id) })}
          onExportHighlights={() => void exportHighlights(detailsBook, detailsHighlights)}
          onFreeSpace={() => setConfirm({ kind: 'freeSpace', book: detailsBook })}
          onAddFile={() => askForFile(detailsBook)}
          onRemove={() => setConfirm({ kind: 'remove', book: detailsBook })}
          extra={<NextVolumes book={detailsBook} books={books} onAdded={handleBrowseAdded} />}
        />
      )}

      {confirm && (
        <div className="library__confirm-backdrop" onClick={() => setConfirm(null)}>
          <div
            className="library__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="library-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="library-confirm-title">{confirm.kind === 'remove' ? 'Remove this book?' : 'Free up the space this book takes?'}</h2>
            <p dir="auto">
              {confirm.kind === 'remove'
                ? `“${confirm.book.title}” and its reading position will be removed from this device. Any saved vocabulary and highlights from it are kept.`
                : `The file of “${confirm.book.title}” is removed from this device. The book stays on your shelf with its progress, highlights and notes, and you can add the file again later.`}
            </p>
            <div className="library__confirm-actions">
              <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={() => void confirmNow()} autoFocus>
                {confirm.kind === 'remove' ? 'Remove' : 'Remove file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
