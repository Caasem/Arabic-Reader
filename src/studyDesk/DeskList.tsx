import { useEffect, useMemo, useRef, useState } from 'react';
import { createOwnDesk, deleteDesk } from './deskStore';
import type { Desk, DeskItem } from './types';
import { looksArabic } from './useDesk';

interface Props {
  desks: Desk[];
  items: DeskItem[];
  current: string;
  /** The open book, so its own desk can be named "This book". */
  bookId: string;
  onOpen(id: string): void;
  /** A desk was deleted (the document moves off it if it was open; the list stays). */
  onDeleted(id: string): void;
  onClose(): void;
  onToast(m: string): void;
}

const ago = (t: number) => {
  const d = Math.round((Date.now() - t) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Every desk, from every book: search, open, start a new one, delete one of your own. */
export function DeskList({ desks, items, current, bookId, onOpen, onDeleted, onClose, onToast }: Props) {
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the list closes; the document stays.
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.deskId, (m.get(i.deskId) ?? 0) + 1));
    return m;
  }, [items]);

  const q = query.trim().toLowerCase();
  const match = (d: Desk) => !q || d.title.toLowerCase().includes(q) || d.html.replace(/<[^>]+>/g, ' ').toLowerCase().includes(q);
  const byRecent = (a: Desk, b: Desk) => b.updatedAt - a.updatedAt;
  const own = desks.filter((d) => d.kind === 'own' && match(d)).sort(byRecent);
  const books = desks.filter((d) => d.kind === 'book' && match(d)).sort(byRecent);

  async function make() {
    const d = await createOwnDesk(query.trim() || undefined);
    onOpen(d.id);
  }

  const row = (d: Desk) => {
    const n = counts.get(d.id) ?? 0;
    const name = d.kind === 'book' && d.bookId === bookId ? `${d.title} (this book)` : d.title;
    return (
      <li key={d.id} className={'sd-dl__row' + (d.id === current ? ' sd-dl__row--on' : '')}>
        <button type="button" className="sd-dl__open" onClick={() => onOpen(d.id)} aria-current={d.id === current ? 'page' : undefined}>
          <span className={looksArabic(d.title) ? 'sd-dl__t sd-dl__t--ar' : 'sd-dl__t'} dir="auto">
            {name}
          </span>
          <span className="sd-dl__m">
            {n === 1 ? '1 item' : `${n} items`} · {ago(d.updatedAt)}
          </span>
        </button>
        {d.kind === 'own' &&
          (confirm === d.id ? (
            <span className="sd-dl__confirm">
              <button
                type="button"
                className="sd-dl__del"
                onClick={() =>
                  void deleteDesk(d.id).then(() => {
                    setConfirm(null);
                    onToast(`Deleted ${d.title}`);
                    onDeleted(d.id);
                  })
                }
              >
                Delete it and its {n === 1 ? 'item' : `${n} items`}
              </button>
              <button type="button" className="sd-dl__keep" onClick={() => setConfirm(null)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="sd-dl__x" aria-label={`Delete ${d.title}`} title="Delete this desk" onClick={() => setConfirm(d.id)}>
              ×
            </button>
          ))}
      </li>
    );
  };

  return (
    <div className="sd-dl" role="dialog" aria-label="All desks">
      <div className="sd-dl__head">
        <input
          ref={inputRef}
          className="sd-dl__input"
          dir="auto"
          value={query}
          placeholder="Find a desk by title or by what it says"
          aria-label="Find a desk"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const first = own[0] ?? books[0];
              if (first) onOpen(first.id);
            }
          }}
        />
        <button type="button" className="sd-btn" onClick={() => void make()}>
          {q ? `New desk “${query.trim()}”` : 'New desk'}
        </button>
      </div>
      <div className="sd-dl__body">
        <h4>Your desks</h4>
        {own.length ? <ul>{own.map(row)}</ul> : <p className="sd-dl__none">{q ? 'None match.' : 'None yet. A desk of your own takes captures from any book: an essay, a topic.'}</p>}
        <h4>Book desks</h4>
        {books.length ? <ul>{books.map(row)}</ul> : <p className="sd-dl__none">{q ? 'None match.' : 'A book gets its desk on its first capture.'}</p>}
      </div>
    </div>
  );
}
