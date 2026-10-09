import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { BookMeta } from '../types';
import { useEscapeKey } from '../components/shared/useEscapeKey';
import { addShelf, putBooksOnShelf } from '../components/library/shelves';
import { usePreferences } from '../state/PreferencesContext';
import { BROWSE_SOURCES, categoriesOf, loadCatalog, searchCatalog, type BrowseBook, type BrowseSource } from './catalog';
import { addBrowseBooks, addedBookIds, addedKey, fileSize, formatBytes, type AddRequest, type BrowseFormat } from './download';
import { firstPages, headText, qualityOf, type Quality } from './sample';
import './BrowseLibraryPanel.css';

const PAGE_SIZE = 40;
/** How long a press waits to see whether it is the first half of a double-press. */
const DOUBLE_PRESS_MS = 260;

const ICON: Record<BrowseFormat, ReactElement> = {
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 14h6M9 17h4" />
    </svg>
  ),
  txt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 10h16M4 14h10M4 18h13" />
    </svg>
  ),
};

const FORMAT_NAME: Record<BrowseFormat, string> = { txt: 'Text', pdf: 'PDF' };

/** Browse library: search a public collection of Arabic books on the device and add one to the shelf. */
export function BrowseLibraryPanel({ onClose, onBooksAdded, ownedIds }: { onClose(): void; onBooksAdded(books: BookMeta[]): void; ownedIds: Set<string> }) {
  useEscapeKey(onClose, true);
  const { prefs, updatePrefs } = usePreferences();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const [source, setSource] = useState<BrowseSource>(BROWSE_SOURCES[0]);
  const [books, setBooks] = useState<BrowseBook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [author, setAuthor] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState<{ key: string; format: BrowseFormat } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [added, setAdded] = useState(addedBookIds);

  useEffect(() => {
    let stale = false;
    setBooks(null);
    setLoadError(null);
    setCategory('');
    setAuthor('');
    setLimit(PAGE_SIZE);
    setProgress('');
    loadCatalog(source, (got, total) => !stale && setProgress(total ? `${Math.round((got / total) * 100)}%` : `${(got / 1048576).toFixed(1)} MB`))
      .then((list) => !stale && setBooks(list))
      .catch((e: unknown) => !stale && setLoadError(e instanceof Error ? e.message : 'The catalogue could not be loaded.'));
    return () => {
      stale = true;
    };
  }, [source]);

  const categories = useMemo(() => (books ? categoriesOf(books) : []), [books]);
  const { shown, total } = useMemo(() => {
    if (!books) return { shown: [], total: 0 };
    const pool = author ? books.filter((b) => b.author === author) : books;
    return searchCatalog(pool, query, category || null, limit);
  }, [books, query, category, author, limit]);

  async function add(book: BrowseBook, request: AddRequest, shelf: boolean) {
    setBusy({ key: book.key, format: request.format });
    setError(null);
    setNotice('');
    try {
      const result = await addBrowseBooks(book, request, setStatus);
      setAdded(addedBookIds());
      const toShelf = shelf && request.mode === 'separate' && request.volumes.length > 1;
      if (result.books.length) {
        onBooksAdded(result.books);
        if (toShelf) {
          const { shelves, shelf: made } = addShelf(prefsRef.current.libraryShelves, book.title);
          if (made) updatePrefs({ libraryShelves: putBooksOnShelf(shelves, made.id, result.books.map((b) => b.id)) });
        }
      }
      const parts: string[] = [];
      if (result.books.length) parts.push(`Added ${result.books.length} book${result.books.length === 1 ? '' : 's'}${toShelf ? ` to the shelf “${book.title}”` : ''}.`);
      if (result.pagesOnly) parts.push(`${result.pagesOnly} PDF${result.pagesOnly === 1 ? ' has' : 's have'} no readable text, so ${result.pagesOnly === 1 ? 'it opens' : 'they open'} as page images.`);
      setNotice(parts.join(' '));
      if (result.failed.length) setError(result.failed.map((f) => `Volume ${f.volume + 1}: ${f.message}`).join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that book.');
    } finally {
      setBusy(null);
      setStatus('');
    }
  }

  return (
    <div className="browse__backdrop" onClick={onClose}>
      <section className="browse" role="dialog" aria-modal="true" aria-labelledby="browse-title" onClick={(e) => e.stopPropagation()}>
        <header className="browse__head">
          <h2 id="browse-title">Browse library</h2>
          {books && (
            <span className="browse__count">
              {total.toLocaleString()} book{total === 1 ? '' : 's'}
            </span>
          )}
          <button className="browse__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="browse__sources" role="tablist">
          {BROWSE_SOURCES.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === source.id} className={'browse__source' + (s.id === source.id ? ' browse__source--active' : '')} onClick={() => setSource(s)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="browse__filters">
          <input className="browse__search" type="search" dir="auto" placeholder="Title, author or subject…" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(PAGE_SIZE))} autoFocus />
          <select className="browse__category" value={category} onChange={(e) => (setCategory(e.target.value), setLimit(PAGE_SIZE))} aria-label="Subject">
            <option value="">All subjects</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {author && (
          <div className="browse__authorfilter">
            <span className="browse__chipx">
              <span dir="auto">{author}</span>
              <button onClick={() => setAuthor('')} aria-label="Show all authors">
                ×
              </button>
            </span>
          </div>
        )}

        {error && <div className="browse__error">{error}</div>}
        {notice && (
          <div className="browse__notice" role="status">
            {notice}
          </div>
        )}

        <div className="browse__list">
          {loadError ? (
            <p className="browse__note">{loadError} Check your connection and reopen this window.</p>
          ) : !books ? (
            <p className="browse__note">Loading the catalogue{progress ? ` (${progress})` : ''}… Only the first visit needs a connection.</p>
          ) : shown.length === 0 ? (
            <p className="browse__note">No books match.</p>
          ) : (
            <>
              {shown.map((book) => (
                <BrowseRow
                  key={book.key}
                  book={book}
                  added={added}
                  ownedIds={ownedIds}
                  busyFormat={busy?.key === book.key ? busy.format : null}
                  anyBusy={busy !== null}
                  status={status}
                  showQuality={prefs.browseShowQuality}
                  onAuthor={setAuthor}
                  onAdd={(request, shelf) => add(book, request, shelf)}
                />
              ))}
              {total > shown.length && (
                <button className="btn btn--ghost browse__more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show more
                </button>
              )}
            </>
          )}
        </div>

        <footer className="browse__foot">Books come from the open ieasybooks collections on Hugging Face (MIT licence). Each book is downloaded once and then works offline.</footer>
      </section>
    </div>
  );
}

/** True once the element has been on screen, so per-row work (sizes, quality) waits until a row is seen. */
function useSeen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

interface RowProps {
  book: BrowseBook;
  added: Record<string, string>;
  ownedIds: Set<string>;
  busyFormat: BrowseFormat | null;
  anyBusy: boolean;
  status: string;
  showQuality: boolean;
  onAuthor(author: string): void;
  onAdd(request: AddRequest, shelf: boolean): void;
}

/**
 * One result. Arabic reads right to left, so the book's text is on the right and the Text and PDF
 * buttons on the left. A single volume is added with one press; with several, a press opens the
 * volumes (All, Vol. 1, 2 …) and a double press adds them all.
 */
function BrowseRow({ book, added, ownedIds, busyFormat, anyBusy, status, showQuality, onAuthor, onAdd }: RowProps) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeen(ref);
  const volumeCount = Math.max(book.volumes, book.txtPaths.length, 1);
  const multi = volumeCount > 1;
  const formats: BrowseFormat[] = book.pdfPaths.length ? ['txt', 'pdf'] : ['txt'];

  const [menu, setMenu] = useState<BrowseFormat | null>(null);
  const [shelf, setShelf] = useState(true);
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<[number, string][] | null | 'failed'>(null);
  const [quality, setQuality] = useState<Quality | null>(null);

  const have = (format: BrowseFormat, v: number) => {
    const id = added[addedKey(book, format, v)];
    return !!id && ownedIds.has(id);
  };
  const haveCount = (format: BrowseFormat) => Array.from({ length: volumeCount }, (_, v) => v).filter((v) => have(format, v)).length;
  const totalAdded = haveCount('txt') + haveCount('pdf');

  // A single volume's sizes show on its buttons once the row is seen; a multi-volume book's, when its volumes open.
  useEffect(() => {
    if (!seen || multi) return;
    let stale = false;
    for (const format of formats) void fileSize(book, format, 0).then((n) => !stale && setSizes((s) => ({ ...s, [`${format}0`]: n })));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formats is derived from book
  }, [seen, multi, book]);
  useEffect(() => {
    if (!menu) return;
    let stale = false;
    for (let v = 0; v < volumeCount; v++) void fileSize(book, menu, v).then((n) => !stale && setSizes((s) => ({ ...s, [`${menu}${v}`]: n })));
    return () => {
      stale = true;
    };
  }, [menu, book, volumeCount]);

  useEffect(() => {
    if (!showQuality || !seen) return;
    let stale = false;
    void qualityOf(book).then((q) => !stale && setQuality(q)).catch(() => {});
    return () => {
      stale = true;
    };
  }, [showQuality, seen, book]);

  function togglePreview() {
    const next = !previewOpen;
    setPreviewOpen(next);
    if (next && preview === null) {
      void headText(book)
        .then((text) => setPreview(firstPages(text)))
        .catch(() => setPreview('failed'));
    }
  }

  const request = (format: BrowseFormat, volumes: number[]): AddRequest => ({ format, volumes, mode: 'separate' });
  const allVolumes = Array.from({ length: volumeCount }, (_, v) => v);

  // The volumes open once the double-press window has passed: opening on the first press moves the layout, so the second press of a
  // double-press would land on something else.
  const menuTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(menuTimer.current), []);

  function press(format: BrowseFormat, clicks: number) {
    if (anyBusy) return;
    window.clearTimeout(menuTimer.current);
    if (multi) {
      if (clicks === 1) menuTimer.current = window.setTimeout(() => setMenu((m) => (m === format ? null : format)), DOUBLE_PRESS_MS);
    } else if (!have(format, 0)) onAdd(request(format, [0]), false);
  }
  function pressTwice(format: BrowseFormat) {
    window.clearTimeout(menuTimer.current);
    if (!multi || anyBusy) return;
    setMenu(null);
    const missing = allVolumes.filter((v) => !have(format, v));
    if (missing.length) onAdd(request(format, missing), shelf);
  }

  const sizeLine = (format: BrowseFormat) => {
    if (multi) {
      const n = haveCount(format);
      return n === volumeCount ? 'all added ✓' : n ? `${n}/${volumeCount} added` : `${volumeCount} volumes`;
    }
    const size = sizes[`${format}0`];
    return size ? formatBytes(size) : '';
  };

  return (
    <article className="browse__row" ref={ref}>
      <div className="browse__line">
        <div className="browse__meta">
          <button className="browse__title" onClick={togglePreview} aria-expanded={previewOpen} title="Preview the first page" dir="auto">
            {book.title}
            <i className="browse__chev" aria-hidden="true" />
          </button>
          <div className="browse__sub">
            {book.author && (
              <button className="browse__author" onClick={() => onAuthor(book.author)} title="More by this author" dir="auto">
                {book.author}
              </button>
            )}
            {book.category && (
              <span className="browse__pill" dir="auto">
                {book.category}
              </span>
            )}
          </div>
          <div className="browse__facts">
            {book.pages > 0 && <span>{book.pages.toLocaleString()} pages</span>}
            {multi && <span>{volumeCount} volumes</span>}
            {totalAdded > 0 && <span>{totalAdded} added</span>}
          </div>
          {showQuality && quality && (
            <div className="browse__badges">
              <span className={'browse__badge browse__badge--' + (quality.percent >= 90 ? 'good' : quality.percent >= 75 ? 'warn' : 'bad')}>
                <i className="browse__dot" aria-hidden="true" />
                {quality.label} · {quality.percent}%
              </span>
            </div>
          )}
        </div>

        <div className="browse__acts">
          {formats.map((format) => {
            const done = multi ? haveCount(format) === volumeCount : have(format, 0);
            const open = menu === format;
            const working = busyFormat === format;
            return (
              <button
                key={format}
                className={'browse__get' + (format === 'pdf' ? ' browse__get--alt' : '') + (open ? ' browse__get--open' : '') + (done ? ' browse__get--done' : '')}
                disabled={anyBusy || (done && !multi)}
                aria-expanded={multi ? open : undefined}
                title={multi ? 'Click to choose volumes. Double-click to add all of them.' : undefined}
                onClick={(e) => press(format, e.detail)}
                onDoubleClick={() => pressTwice(format)}
              >
                {done && !multi ? (
                  'Added ✓'
                ) : (
                  <>
                    {ICON[format]}
                    <b>
                      {FORMAT_NAME[format]}
                      {multi ? ' ▾' : ''}
                    </b>
                    <small>{working ? status || 'Adding…' : sizeLine(format)}</small>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showQuality && quality && quality.percent < 75 && book.pdfPaths.length > 0 && (
        <div className="browse__warn">
          <b>Poor scan.</b> About {100 - quality.percent}% of the words in a sample were not found in the dictionary. The PDF shows the real pages and is the better choice here.
        </div>
      )}

      {previewOpen && (
        <div className="browse__preview">
          {preview === null ? (
            <p className="browse__hint">Reading the first page…</p>
          ) : preview === 'failed' || preview.length === 0 ? (
            <p className="browse__hint">No preview available for this book.</p>
          ) : (
            preview.map(([n, text]) => (
              <div key={n}>
                <div className="browse__page">[ص {n}]</div>
                <p dir="rtl">{text}</p>
              </div>
            ))
          )}
        </div>
      )}

      {multi && menu && (
        <div className="browse__menu" role="group" aria-label={`Volumes as ${FORMAT_NAME[menu]}`}>
          <span className="browse__menu-label">{FORMAT_NAME[menu]}</span>
          <div className="browse__chips">
            <button className="browse__chip browse__chip--all" disabled={anyBusy || haveCount(menu) === volumeCount} onClick={() => onAdd(request(menu, allVolumes.filter((v) => !have(menu, v))), shelf)}>
              <b>All volumes</b>
              <small>{haveCount(menu) === volumeCount ? 'added ✓' : 'one book each'}</small>
            </button>
            {allVolumes.map((v) => {
              const done = have(menu, v);
              const size = sizes[`${menu}${v}`];
              return (
                <button key={v} className={'browse__chip' + (done ? ' browse__chip--done' : '')} disabled={anyBusy || done} onClick={() => onAdd(request(menu, [v]), false)}>
                  <b>Vol. {v + 1}</b>
                  <small>{done ? 'added ✓' : size ? formatBytes(size) : ''}</small>
                </button>
              );
            })}
          </div>
          <label className="browse__check">
            <input type="checkbox" checked={shelf} onChange={(e) => setShelf(e.target.checked)} />
            <span>On a shelf</span>
          </label>
        </div>
      )}
    </article>
  );
}
