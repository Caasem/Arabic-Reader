import { useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { goToBookLocation } from '../readerChords';
import type { BookSearchMode } from './engine';
import { useBookSearchPalette } from './useBookSearchPalette';

interface Props {
  book: BookMeta;
  initialQuery: string;
  onClose(): void;
}

/** The Alt+S palette: type a word, pick a match, Enter jumps to it in the book. */
export function BookSearchPalette({ book, initialQuery, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<BookSearchMode>('root');
  const [selection, setSelection] = useState({ key: '', index: 0 });
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const { loading, failed, hits, roots } = useBookSearchPalette(book, query, mode);

  // The highlighted row belongs to one result set, so it resets by comparison.
  const key = `${mode}:${query.trim()}`;
  const selected = selection.key === key ? selection.index : 0;
  const count = hits?.length ?? 0;
  const select = (index: number) => setSelection({ key, index });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, hits]);

  function jump(index: number) {
    const hit = hits?.[index];
    if (!hit) return;
    if (goToBookLocation(hit.cfi, { href: hit.href, text: hit.match, before: hit.before })) onClose();
    else setNotice('Jumping to a match needs the EPUB reader (Clean Reader is off-limits for now).');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      select(Math.min(selected + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      select(Math.max(selected - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      jump(selected);
    }
  }

  const trimmed = query.trim();
  return (
    <div className="bsearch__body" onKeyDown={onKeyDown}>
      <div className="bsearch__input-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          className="bsearch__input"
          dir="rtl"
          lang="ar"
          value={query}
          placeholder="ابحث في الكتاب"
          aria-label="Search this book"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd className="bsearch__key">Alt S</kbd>
      </div>

      <div className="bsearch__modes" role="group" aria-label="Match">
        <button type="button" className="bsearch__chip" aria-pressed={mode === 'root'} onClick={() => setMode('root')}>
          Same root
        </button>
        <button type="button" className="bsearch__chip" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
          Exact text
        </button>
        {mode === 'root' && roots.length > 0 && (
          <span className="bsearch__roots" lang="ar" dir="rtl">
            {roots.map((r) => r.split('').join(' ')).join(' · ')}
          </span>
        )}
      </div>

      <div className="bsearch__results" role="listbox" aria-label="Matches">
        {!trimmed && <p className="bsearch__hint">Type an Arabic word. Same root finds every form of it; Exact text finds that spelling.</p>}
        {trimmed && failed && <p className="bsearch__hint">This book could not be searched.</p>}
        {trimmed && !failed && loading && !hits && <p className="bsearch__hint">Searching…</p>}
        {trimmed && !failed && hits && hits.length === 0 && (
          <p className="bsearch__hint">{mode === 'root' ? 'No word with this root in the book.' : 'No match in the book.'}</p>
        )}
        {hits?.map((hit, i) => (
          <button
            key={hit.cfi + i}
            ref={i === selected ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={i === selected}
            className={'bsearch__hit' + (i === selected ? ' bsearch__hit--active' : '')}
            onClick={() => (i === selected ? jump(i) : select(i))}
            onDoubleClick={() => jump(i)}
          >
            <span className="bsearch__text" lang="ar" dir="rtl">
              {hit.before}
              <mark>{hit.match}</mark>
              {hit.after}
            </span>
            {hit.label && <span className="bsearch__where">{hit.label}</span>}
          </button>
        ))}
        {notice && <p className="bsearch__hint">{notice}</p>}
      </div>

      <div className="bsearch__foot">
        <span>{hits ? `${count}${count >= 200 ? '+' : ''} ${count === 1 ? 'match' : 'matches'}` : ' '}</span>
        <span>↑↓ move · Enter jump · Esc close</span>
      </div>
    </div>
  );
}
