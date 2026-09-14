import { IconClose } from '../shared/icons';
import { useEscapeKey } from '../shared/useEscapeKey';
import type { BookSearch, SearchMode, SearchScope } from './hooks/useBookSearch';

const SCOPES: { id: SearchScope; label: string; placeholder: string }[] = [
  { id: 'page', label: 'This page', placeholder: 'Search this page…' },
  { id: 'book', label: 'This book', placeholder: 'Search this book…' },
  { id: 'library', label: 'Library', placeholder: 'Search your library…' },
];

const MODES: { id: SearchMode; label: string }[] = [
  { id: 'phrase', label: 'Exact phrase' },
  { id: 'word', label: 'Any word' },
];

interface Props {
  search: BookSearch;
  liveSearchEnabled: boolean;
  historyEnabled: boolean;
  onClose(): void;
}

/** In-book and library search. Closing it never moves the reading position. */
export function SearchOverlay({ search, liveSearchEnabled, historyEnabled, onClose }: Props) {
  useEscapeKey(onClose);

  const { results, searching, activeIndex } = search;
  const needsSubmit = !liveSearchEnabled || search.scope === 'library';

  return (
    <div className="reader__search-backdrop" onClick={onClose}>
      <aside className="reader__search" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="reader__search-top">
          <form
            className="reader__search-form"
            onSubmit={(e) => {
              e.preventDefault();
              search.submit();
            }}
          >
            <input
              className="reader__search-input"
              type="search"
              placeholder={SCOPES.find((s) => s.id === search.scope)?.placeholder}
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              autoFocus
            />
            {needsSubmit && (
              <button className="btn btn--ghost" type="submit" disabled={searching || !search.query.trim()}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            )}
          </form>
          <button className="reader__search-close" onClick={onClose} aria-label="Close search">
            <IconClose size={14} />
          </button>
        </div>

        <div className="reader__search-options">
          <div className="reader__search-options-group">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                className={'reader__search-option' + (search.scope === s.id ? ' reader__search-option--active' : '')}
                aria-pressed={search.scope === s.id}
                onClick={() => search.setScope(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="reader__search-options-group">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={'reader__search-option' + (search.mode === m.id ? ' reader__search-option--active' : '')}
                aria-pressed={search.mode === m.id}
                onClick={() => search.setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {results && results.length > 0 && (
          <div className="reader__search-nav">
            <span>
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
            <div className="reader__search-nav-controls">
              <button onClick={() => search.goToResult(activeIndex - 1)} aria-label="Previous result">
                ↑
              </button>
              <span>
                {activeIndex + 1} / {results.length}
              </span>
              <button onClick={() => search.goToResult(activeIndex + 1)} aria-label="Next result">
                ↓
              </button>
            </div>
          </div>
        )}

        {!results && !searching && historyEnabled && search.history.length > 0 && (
          <div className="reader__search-history">
            <span className="reader__search-history-label">Recent</span>
            {search.history.map((item) => (
              <button key={item} className="reader__search-history-item" onClick={() => search.pickHistoryItem(item)}>
                {item}
              </button>
            ))}
          </div>
        )}

        {results && (
          <div className="reader__search-results" aria-live="polite">
            {results.length === 0 && <p className="reader__search-empty">No matches found.</p>}
            {results.map((r, i) => (
              <button
                key={r.book.id + r.cfi + i}
                className={'reader__search-result' + (i === activeIndex ? ' reader__search-result--active' : '')}
                onClick={() => search.goToResult(i)}
              >
                {(search.scope === 'library' || r.label) && (
                  <div className="reader__search-result-label">
                    {search.scope === 'library' ? r.book.title : r.label}
                    {search.scope === 'library' && r.label ? ` — ${r.label}` : ''}
                  </div>
                )}
                <div className="reader__search-result-excerpt">{r.excerpt}</div>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
