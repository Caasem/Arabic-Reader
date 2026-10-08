import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { useEscapeKey } from '../components/shared/useEscapeKey';
import { addShelf, putBooksOnShelf } from '../components/library/shelves';
import { usePreferences } from '../state/PreferencesContext';
import { BROWSE_SOURCES, categoriesOf, loadCatalog, searchCatalog, type BrowseBook, type BrowseSource } from './catalog';
import { addBrowseBooks, addedBookIds, addedKey, fileSize, formatBytes, pathsFor, type AddRequest, type BrowseFormat } from './download';
import './BrowseLibraryPanel.css';

const PAGE_SIZE = 40;

const FORMAT_HINT: Record<BrowseFormat, string> = {
  txt: 'Reflowable text: small, quick, works with word lookup. Read from scans by machine, so it has mistakes.',
  pdf: 'The scanned original with its real pages. Much larger; the text layer (if any) is read as text.',
};

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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [added, setAdded] = useState(addedBookIds);

  useEffect(() => {
    let stale = false;
    setBooks(null);
    setLoadError(null);
    setCategory('');
    setLimit(PAGE_SIZE);
    setOpenKey(null);
    setProgress('');
    loadCatalog(source, (got, total) => !stale && setProgress(total ? `${Math.round((got / total) * 100)}%` : `${(got / 1048576).toFixed(1)} MB`))
      .then((list) => !stale && setBooks(list))
      .catch((e: unknown) => !stale && setLoadError(e instanceof Error ? e.message : 'The catalogue could not be loaded.'));
    return () => {
      stale = true;
    };
  }, [source]);

  const categories = useMemo(() => (books ? categoriesOf(books) : []), [books]);
  const { shown, total } = useMemo(() => (books ? searchCatalog(books, query, category || null, limit) : { shown: [], total: 0 }), [books, query, category, limit]);

  async function add(book: BrowseBook, request: AddRequest, shelf: boolean) {
    setBusyKey(book.key);
    setError(null);
    setNotice('');
    try {
      const result = await addBrowseBooks(book, request, setStatus);
      setAdded(addedBookIds());
      if (result.books.length) {
        onBooksAdded(result.books);
        if (shelf && request.mode === 'separate' && request.volumes.length > 1) {
          const { shelves, shelf: made } = addShelf(prefsRef.current.libraryShelves, book.title);
          if (made) updatePrefs({ libraryShelves: putBooksOnShelf(shelves, made.id, result.books.map((b) => b.id)) });
        }
      }
      const parts: string[] = [];
      if (result.books.length) parts.push(`Added ${result.books.length} book${result.books.length === 1 ? '' : 's'}${shelf && request.volumes.length > 1 && request.mode === 'separate' ? ` to the shelf “${book.title}”` : ''}.`);
      if (result.pagesOnly) parts.push(`${result.pagesOnly} PDF${result.pagesOnly === 1 ? ' has' : 's have'} no readable text, so ${result.pagesOnly === 1 ? 'it opens' : 'they open'} as page images.`);
      setNotice(parts.join(' '));
      if (result.failed.length) setError(result.failed.map((f) => `Volume ${f.volume + 1}: ${f.message}`).join(' '));
      if (!result.failed.length) setOpenKey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that book.');
    } finally {
      setBusyKey(null);
      setStatus('');
    }
  }

  return (
    <div className="browse__backdrop" onClick={onClose}>
      <section className="browse" role="dialog" aria-modal="true" aria-labelledby="browse-title" onClick={(e) => e.stopPropagation()}>
        <header className="browse__head">
          <h2 id="browse-title">Browse library</h2>
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

        {error && <div className="browse__error">{error}</div>}
        {notice && <div className="browse__notice" role="status">{notice}</div>}

        <div className="browse__list">
          {loadError ? (
            <p className="browse__note">{loadError} Check your connection and reopen this window.</p>
          ) : !books ? (
            <p className="browse__note">Loading the catalogue{progress ? ` (${progress})` : ''}… Only the first visit needs a connection.</p>
          ) : shown.length === 0 ? (
            <p className="browse__note">No books match.</p>
          ) : (
            <>
              <p className="browse__count">
                {total.toLocaleString()} book{total === 1 ? '' : 's'}
              </p>
              {shown.map((book) => {
                const open = openKey === book.key;
                const have = Object.keys(added).filter((k) => k.startsWith(`${book.key}#`) && ownedIds.has(added[k])).length;
                return (
                  <article key={book.key} className="browse__row">
                    <div className="browse__line">
                      <div className="browse__meta">
                        <div className="browse__title" dir="auto">
                          {book.title}
                        </div>
                        <div className="browse__sub" dir="auto">
                          {[book.author, book.category].filter(Boolean).join(' · ')}
                        </div>
                        <div className="browse__sub">
                          {book.pages ? `${book.pages.toLocaleString()} pages` : ''}
                          {book.volumes > 1 ? ` · ${book.volumes} volumes` : ''}
                          {have ? ` · ${have} in your library` : ''}
                        </div>
                      </div>
                      <button className="btn btn--primary browse__add" onClick={() => setOpenKey(open ? null : book.key)} aria-expanded={open} disabled={busyKey !== null}>
                        {open ? 'Close' : 'Add…'}
                      </button>
                    </div>
                    {open && <AddOptions book={book} added={added} ownedIds={ownedIds} busy={busyKey === book.key} status={status} onAdd={(request, shelf) => add(book, request, shelf)} />}
                  </article>
                );
              })}
              {total > shown.length && (
                <button className="btn btn--ghost browse__more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show more
                </button>
              )}
            </>
          )}
        </div>

        <footer className="browse__foot">
          Books come from the open ieasybooks collections on Hugging Face (MIT licence). Each book is downloaded once and then works offline.
        </footer>
      </section>
    </div>
  );
}

/** The choices for one book: format, which volumes, and whether volumes become separate books on a shelf. */
function AddOptions({ book, added, ownedIds, busy, status, onAdd }: { book: BrowseBook; added: Record<string, string>; ownedIds: Set<string>; busy: boolean; status: string; onAdd(request: AddRequest, shelf: boolean): void }) {
  const [format, setFormat] = useState<BrowseFormat>('txt');
  const volumeCount = Math.max(book.volumes, book.txtPaths.length);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(Array.from({ length: volumeCount }, (_, i) => i)));
  const [mode, setMode] = useState<'separate' | 'combined'>('separate');
  const [shelf, setShelf] = useState(true);
  const [sizes, setSizes] = useState<Record<string, number | null>>({});

  const available = pathsFor(book, format);
  const hasPdf = book.pdfPaths.length > 0;
  const chosen = [...picked].filter((v) => v < available.length).sort((a, b) => a - b);

  // Sizes come from one small request per volume, only for the format on screen.
  useEffect(() => {
    let stale = false;
    for (let v = 0; v < available.length; v++) {
      void fileSize(book, format, v).then((n) => !stale && setSizes((s) => ({ ...s, [`${format}${v}`]: n })));
    }
    return () => {
      stale = true;
    };
  }, [book, format, available.length]);

  const sizeOf = (v: number) => sizes[`${format}${v}`];
  const totalBytes = chosen.reduce((n, v) => n + (sizeOf(v) ?? 0), 0);
  const unknown = chosen.some((v) => sizeOf(v) == null);
  const owned = (v: number) => {
    const id = added[addedKey(book, format, v)];
    return !!id && ownedIds.has(id);
  };
  const separate = format === 'pdf' || mode === 'separate';
  const count = separate ? chosen.length : 1;

  function toggle(v: number) {
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(v)) next.add(v);
      return next;
    });
  }

  return (
    <div className="browse__options">
      <div className="browse__seg" role="radiogroup" aria-label="Format">
        <button role="radio" aria-checked={format === 'txt'} className={'browse__seg-item' + (format === 'txt' ? ' browse__seg-item--on' : '')} onClick={() => setFormat('txt')}>
          Text
        </button>
        <button role="radio" aria-checked={format === 'pdf'} className={'browse__seg-item' + (format === 'pdf' ? ' browse__seg-item--on' : '')} onClick={() => setFormat('pdf')} disabled={!hasPdf}>
          PDF
        </button>
      </div>
      <p className="browse__hint">{FORMAT_HINT[format]}</p>

      {volumeCount > 1 && (
        <fieldset className="browse__volumes">
          <legend>
            Volumes{' '}
            <button type="button" className="browse__link" onClick={() => setPicked(new Set(available.map((_, i) => i)))}>
              all
            </button>{' '}
            <button type="button" className="browse__link" onClick={() => setPicked(new Set())}>
              none
            </button>
          </legend>
          {available.map((_, v) => (
            <label key={v} className="browse__volume">
              <input type="checkbox" checked={picked.has(v)} onChange={() => toggle(v)} />
              <span>Volume {v + 1}</span>
              <span className="browse__volume-size">{owned(v) ? 'in your library' : sizeOf(v) != null ? formatBytes(sizeOf(v) as number) : ''}</span>
            </label>
          ))}
        </fieldset>
      )}

      {chosen.length > 1 && format === 'txt' && (
        <div className="browse__seg" role="radiogroup" aria-label="How to add the volumes">
          <button role="radio" aria-checked={mode === 'separate'} className={'browse__seg-item' + (mode === 'separate' ? ' browse__seg-item--on' : '')} onClick={() => setMode('separate')}>
            A book per volume
          </button>
          <button role="radio" aria-checked={mode === 'combined'} className={'browse__seg-item' + (mode === 'combined' ? ' browse__seg-item--on' : '')} onClick={() => setMode('combined')}>
            One combined book
          </button>
        </div>
      )}
      {chosen.length > 1 && separate && (
        <label className="browse__check">
          <input type="checkbox" checked={shelf} onChange={(e) => setShelf(e.target.checked)} />
          <span dir="auto">Put them on a shelf named “{book.title}”</span>
        </label>
      )}

      <button
        className="btn btn--primary browse__go"
        disabled={busy || chosen.length === 0}
        onClick={() => onAdd({ format, volumes: chosen, mode: separate ? 'separate' : 'combined' }, shelf)}
      >
        {busy
          ? status || 'Adding…'
          : `Add ${count} ${format === 'pdf' ? 'PDF' : 'book'}${count === 1 ? '' : 's'}${totalBytes ? ` · ${unknown ? 'at least ' : ''}${formatBytes(totalBytes)}` : ''}`}
      </button>
    </div>
  );
}
