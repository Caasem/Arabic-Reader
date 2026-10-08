import { useEffect, useMemo, useState } from 'react';
import type { BookMeta } from '../types';
import { useEscapeKey } from '../components/shared/useEscapeKey';
import { BROWSE_SOURCES, categoriesOf, loadCatalog, searchCatalog, type BrowseBook, type BrowseSource } from './catalog';
import { addBrowseBook, addedBookIds } from './download';
import './BrowseLibraryPanel.css';

const PAGE_SIZE = 40;

/** Browse library: search a public collection of Arabic books on the device and add one to the shelf. */
export function BrowseLibraryPanel({ onClose, onBookAdded, ownedIds }: { onClose(): void; onBookAdded(book: BookMeta): void; ownedIds: Set<string> }) {
  useEscapeKey(onClose, true);
  const [source, setSource] = useState<BrowseSource>(BROWSE_SOURCES[0]);
  const [books, setBooks] = useState<BrowseBook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(addedBookIds);

  useEffect(() => {
    let stale = false;
    setBooks(null);
    setLoadError(null);
    setCategory('');
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
  const { shown, total } = useMemo(() => (books ? searchCatalog(books, query, category || null, limit) : { shown: [], total: 0 }), [books, query, category, limit]);

  async function add(book: BrowseBook) {
    setBusyKey(book.key);
    setError(null);
    try {
      const meta = await addBrowseBook(book, setStatus);
      setAdded(addedBookIds());
      onBookAdded(meta);
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

        <div className="browse__list">
          {loadError ? (
            <p className="browse__note">
              {loadError} Check your connection and reopen this window.
            </p>
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
                const owned = !!added[book.key] && ownedIds.has(added[book.key]);
                return (
                  <article key={book.key} className="browse__row">
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
                      </div>
                    </div>
                    {owned ? (
                      <span className="browse__owned">In your library</span>
                    ) : (
                      <button className="btn btn--primary browse__add" onClick={() => add(book)} disabled={busyKey !== null}>
                        {busyKey === book.key ? status || 'Adding…' : 'Add'}
                      </button>
                    )}
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
          Books come from the open ieasybooks collections on Hugging Face (MIT licence). The text was read from scans by machine, so expect some mistakes. Each book is downloaded once and then works offline.
        </footer>
      </section>
    </div>
  );
}
