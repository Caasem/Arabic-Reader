import { useEffect, useMemo, useRef, useState } from 'react';
import { libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import type { DeskTrip } from './trip';
import { looksArabic } from './useDesk';
import { filterCandidates, isImageFile, KIND_LABEL, listPullCandidates, pullIn, pullInImage, type PullCandidate, type PullKind, type PullSpot, type PullTarget } from './pullIn';

interface Props {
  book: BookMeta;
  /** The desk the pulled item goes to. */
  deskId: string;
  /** The place on the open page for margin targets; null when no page is showing (margins are then off). */
  spot: PullSpot | null;
  /** Which margins the page shows. */
  margins: 'both' | 'left' | 'right' | 'off';
  onClose(): void;
  onToast(m: string): void;
  /** Go to another book to capture from it, then come back (a capture trip, trip.ts). */
  onGoToBook?(book: BookMeta, target: PullTarget): void;
  /** Open on the book list (Go to another book). */
  initialPicking?: boolean;
  /** The last trip from this book: a Back to <book> row at the top goes again, same target and spot. */
  again?: DeskTrip | null;
  onGoAgain?(): void;
}

const TARGET_KEY = 'studyDesk.pullTarget';
const IMAGE = '__image__';
const GO = '__go__';
const AGAIN = '__again__';
const LIMIT = 80;
const FILTERS: { kind: PullKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'highlight', label: 'Highlights' },
  { kind: 'word', label: 'Words' },
  { kind: 'item', label: 'Desk items' },
];

function loadTarget(): PullTarget {
  try {
    const v = localStorage.getItem(TARGET_KEY);
    if (v === 'left' || v === 'right' || v === 'inbox') return v;
  } catch {
    // The right margin.
  }
  return 'right';
}

/** Where the trip again files its capture: the same place as last time. */
const againWhere = (t: DeskTrip) => (t.target === 'inbox' || !t.spot ? 'to the inbox' : `to the ${t.target} margin, same place as last time`);

/** Pull in (Alt+U): the dictionary search's input row and result rows over highlights, words and other books' desk items. */
export function PullInBody({ book, deskId, spot, margins, onClose, onToast, onGoToBook, initialPicking, again, onGoAgain }: Props) {
  const [all, setAll] = useState<PullCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<PullKind | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [chosenTarget, setChosenTarget] = useState<PullTarget>(loadTarget);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  /** Choosing a book to go to, instead of something to pull in. */
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [picking, setPicking] = useState(!!initialPicking && !!onGoToBook);

  const sides: PullTarget[] = !spot || margins === 'off' ? [] : margins === 'both' ? ['left', 'right'] : [margins];
  const target: PullTarget = sides.includes(chosenTarget) ? chosenTarget : chosenTarget !== 'inbox' && sides.length ? sides[sides.length - 1] : 'inbox';

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    let alive = true;
    void listPullCandidates(book).then((c) => alive && setAll(c));
    return () => {
      alive = false;
    };
  }, [book]);

  const list = useMemo(() => {
    const byKind = (all ?? []).filter((c) => kind === 'all' || c.kind === kind);
    return filterCandidates(byKind, query.trim()).slice(0, LIMIT);
  }, [all, kind, query]);

  const bookList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (books ?? []).filter((b) => b.id !== book.id && (!q || `${b.title} ${b.author ?? ''}`.toLowerCase().includes(q)));
  }, [books, book.id, query]);

  // Back to <book> leads, and is chosen at first, while nothing is typed: Alt+U then Enter goes again.
  const showAgain = !!(again && onGoAgain && onGoToBook && !query.trim());
  const ids = picking ? bookList.map((b) => b.id) : [...(showAgain ? [AGAIN] : []), ...(onGoToBook ? [GO] : []), IMAGE, ...list.map((c) => c.key)];
  const active = selected && ids.includes(selected) ? selected : picking ? (bookList[0]?.id ?? null) : showAgain ? AGAIN : (list[0]?.key ?? IMAGE);

  // The library's books, loaded once the list is wanted (newest first).
  useEffect(() => {
    if (!picking || books) return;
    void libraryService.listBooks().then((all) => setBooks([...all].sort((a, b) => (b.updatedAt ?? b.addedAt) - (a.updatedAt ?? a.addedAt))));
  }, [picking, books]);

  function startPicking() {
    setPicking(true);
    setQuery('');
    setSelected(null);
    inputRef.current?.focus();
  }

  function goTo(id: string | null) {
    const to = bookList.find((b) => b.id === id);
    if (to && onGoToBook) onGoToBook(to, target);
  }

  function chooseTarget(t: PullTarget) {
    setChosenTarget(t);
    try {
      localStorage.setItem(TARGET_KEY, t);
    } catch {
      // Not remembered.
    }
  }

  const placedMessage = (t: PullTarget) => (t === 'inbox' ? 'Added to the inbox and the desk' : `Placed in the ${t} margin`);

  async function take(c: PullCandidate) {
    if (busy.current) return;
    busy.current = true;
    try {
      await pullIn(book, deskId, c, target, spot);
      onToast(placedMessage(target));
      onClose();
    } finally {
      busy.current = false;
    }
  }

  async function takeImage(file: File | undefined) {
    if (!isImageFile(file)) return onToast('That file is not an image');
    await pullInImage(book, deskId, file, target, spot);
    onToast(placedMessage(target));
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const at = ids.indexOf(active);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (picking) {
        setPicking(false);
        setQuery('');
        setSelected(null);
      } else onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(ids[Math.min(at + 1, ids.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(ids[Math.max(at - 1, 0)]);
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (picking) goTo(active);
      else if (active === AGAIN) onGoAgain?.();
      else if (active === GO) startPicking();
      else if (active === IMAGE) fileRef.current?.click();
      else {
        const c = list.find((x) => x.key === active);
        if (c) void take(c);
      }
    }
  }

  const targets: { t: PullTarget; label: string }[] = [
    ...(sides.includes('left') ? [{ t: 'left' as const, label: 'Left margin' }] : []),
    ...(sides.includes('right') ? [{ t: 'right' as const, label: 'Right margin' }] : []),
    { t: 'inbox', label: 'Inbox' },
  ];

  return (
    <div className="dsearch__body sd-inbox sd-pull" onKeyDown={onKeyDown}>
      <div className="dsearch__input-row">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        <input
          ref={inputRef}
          className="dsearch__input sd-inbox__input"
          dir="auto"
          value={query}
          placeholder={picking ? 'Find a book to go to' : 'Search highlights, words, other desks'}
          aria-label={picking ? 'Find a book to go to' : 'Search what to pull in'}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
      </div>
      <div className="sd-inbox__desk sd-pull__bar">
        <span>Place in</span>
        <span className="sd-seg" role="group" aria-label="Place in">
          {targets.map(({ t, label }) => (
            <button key={t} type="button" aria-pressed={target === t} onClick={() => chooseTarget(t)}>
              {label}
            </button>
          ))}
        </span>
        {!picking && <span className="sd-seg sd-pull__kinds" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.kind} type="button" aria-pressed={kind === f.kind} onClick={() => (setKind(f.kind), setSelected(null), inputRef.current?.focus())}>
              {f.label}
            </button>
          ))}
        </span>}
      </div>
      {!spot && <p className="dsearch__hint sd-pull__note">Margins take things only while a page is showing; this goes to the inbox.</p>}
      {picking && (
        <div className="dsearch__results sd-pull__books" role="listbox" aria-label="Books">
          <p className="dsearch__hint">The book opens with a bar at the top. Capture there (Alt+X) and you come straight back here with it filed. Esc in the list goes back to Pull in.</p>
          {books === null && <p className="dsearch__hint">Loading…</p>}
          {books && !bookList.length && <p className="dsearch__hint">{query.trim() ? 'No book matches.' : 'No other books in the library.'}</p>}
          {bookList.map((b) => (
            <div key={b.id} role="option" aria-selected={b.id === active} className={'dsearch__entry' + (b.id === active ? ' dsearch__entry--active' : '')} onMouseEnter={() => setSelected(b.id)} onClick={() => goTo(b.id)}>
              <div className="dsearch__entry-head">
                <span className={looksArabic(b.title) ? 'dsearch__headword' : 'dsearch__headword sd-latin'} dir="auto">
                  {b.title}
                </span>
                {b.author && <span className="dsearch__meta" dir="auto">{b.author}</span>}
                <span className="dsearch__provider">Go to</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {!picking && <div className="dsearch__results" role="listbox" aria-label="Pull in">
        {showAgain && again && (
          <div role="option" aria-selected={active === AGAIN} className={'dsearch__entry' + (active === AGAIN ? ' dsearch__entry--active' : '')} onMouseEnter={() => setSelected(AGAIN)} onClick={onGoAgain}>
            <div className="sd-inbox__new">
              <span className="dsearch__provider">Capture</span>
              <b>
                Back to <bdi className={looksArabic(again.to.title) ? undefined : 'sd-latin'}>{again.to.title}</bdi>
              </b>
              <span className="dsearch__meta">{againWhere(again)}</span>
            </div>
          </div>
        )}
        {onGoToBook && (
          <div role="option" aria-selected={active === GO} className={'dsearch__entry' + (active === GO ? ' dsearch__entry--active' : '')} onClick={startPicking}>
            <div className="sd-inbox__new">
              <span className="dsearch__provider">Capture</span>
              <b>Go to another book…</b>
            </div>
          </div>
        )}
        <div role="option" aria-selected={active === IMAGE} className={'dsearch__entry' + (active === IMAGE ? ' dsearch__entry--active' : '')} onClick={() => fileRef.current?.click()}>
          <div className="sd-inbox__new">
            <span className="dsearch__provider">Image</span>
            <b>Image from a file…</b>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Image file" onChange={(e) => void takeImage(e.target.files?.[0])} />
        {all === null && <p className="dsearch__hint">Loading…</p>}
        {all && !list.length && <p className="dsearch__hint">{query.trim() ? 'Nothing matches.' : 'No highlights, words or other desks yet.'}</p>}
        {list.map((c) => (
          <div
            key={c.key}
            role="option"
            aria-selected={c.key === active}
            className={'dsearch__entry' + (c.key === active ? ' dsearch__entry--active' : '')}
            onMouseEnter={() => setSelected(c.key)}
            onClick={() => void take(c)}
          >
            <div className="dsearch__entry-head">
              <span className={c.ar ? 'dsearch__headword' : 'dsearch__headword sd-latin'} dir="auto" lang={c.ar ? 'ar' : undefined}>
                {c.text.length > 140 ? c.text.slice(0, 140) + '…' : c.text}
              </span>
              <span className="dsearch__meta">
                <bdi>{c.from}</bdi>
              </span>
              <span className="dsearch__provider">{KIND_LABEL[c.kind]}</span>
            </div>
            {c.detail && (
              <div className="sd-pull__detail" dir="auto">
                {c.detail}
              </div>
            )}
          </div>
        ))}
      </div>}
    </div>
  );
}
