import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import type { DeskTrip } from './trip';
import { looksArabic } from './useDesk';
import { pullTarget, rememberPullTarget } from './deskMemory';
import { filterCandidates, groupCandidates, isImageFile, KIND_LABEL, listPullCandidates, matchRanges, pullIn, pullInImage, type PullCandidate, type PullKind, type PullSpot, type PullTarget } from './pullIn';

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
  /** The last trip from this book: a Back to <book> pill at the top goes again, same target and spot. */
  again?: DeskTrip | null;
  onGoAgain?(): void;
}

type Scope = 'all' | 'here' | 'other';

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
const SCOPES: { scope: Scope; label: string }[] = [
  { scope: 'all', label: 'All books' },
  { scope: 'here', label: 'This book' },
  { scope: 'other', label: 'Others' },
];

/** Where the trip again files its capture: the same place as last time. */
const againWhere = (t: DeskTrip) => (t.target === 'inbox' || !t.spot ? 'to the inbox' : `to the ${t.target} Ḥāshiya, same place as last time`);

/** `s` with the words typed marked. */
function Marked({ s, query }: { s: string; query: string }) {
  const ranges = query ? matchRanges(s, query) : [];
  if (!ranges.length) return <>{s}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    out.push(s.slice(at, a), <mark key={a}>{s.slice(a, b)}</mark>);
    at = b;
  }
  out.push(s.slice(at));
  return <>{out}</>;
}

/** A page with its two Ḥāshiyas and the spot marked where the item lands, or the inbox tray lit. */
function LandsIn({ target }: { target: PullTarget }) {
  const lines = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <svg viewBox="0 0 220 152" role="img" aria-label={target === 'inbox' ? 'Lands in the inbox' : `Lands in the ${target} Ḥāshiya`}>
      <rect className="sd-pull__pg-page" x="10" y="8" width="200" height="118" rx="6" />
      <rect className={'sd-pull__pg-margin' + (target === 'left' ? ' is-on' : '')} x="16" y="14" width="38" height="106" rx="4" />
      <rect className={'sd-pull__pg-margin' + (target === 'right' ? ' is-on' : '')} x="166" y="14" width="38" height="106" rx="4" />
      {lines.map((i) => (
        <rect key={i} className="sd-pull__pg-line" x={i % 3 === 2 ? 84 : 62} y={22 + i * 11} width={i % 3 === 2 ? 74 : 96} height="3" rx="1.5" />
      ))}
      {target !== 'inbox' && <rect className="sd-pull__pg-pin" x={target === 'left' ? 20 : 170} y="51" width="30" height="14" rx="3" />}
      <path className={'sd-pull__pg-tray' + (target === 'inbox' ? ' is-on' : '')} d="M88 134h44l-4 12h-36z" />
    </svg>
  );
}

const IconAgain = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
);
const IconBook = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5" />
  </svg>
);
const IconImage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 17-5-5L5 20" />
  </svg>
);

/**
 * Pull in (Alt+U): a search over highlights, words and other books' desk items, grouped by book, with a preview of
 * the chosen one and where it lands. Several can be collected (Shift+Enter) and placed at once; Tab changes where.
 */
export function PullInBody({ book, deskId, spot, margins, onClose, onToast, onGoToBook, initialPicking, again, onGoAgain }: Props) {
  const [all, setAll] = useState<PullCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<PullKind | 'all'>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [chosenTarget, setChosenTarget] = useState<PullTarget>(pullTarget);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  /** Choosing a book to go to, instead of something to pull in. */
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [picking, setPicking] = useState(!!initialPicking && !!onGoToBook);

  const sides: PullTarget[] = !spot || margins === 'off' ? [] : margins === 'both' ? ['left', 'right'] : [margins];
  const target: PullTarget = sides.includes(chosenTarget) ? chosenTarget : chosenTarget !== 'inbox' && sides.length ? sides[sides.length - 1] : 'inbox';
  const q = query.trim();

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    let alive = true;
    void listPullCandidates(book, deskId).then((c) => alive && setAll(c));
    return () => {
      alive = false;
    };
  }, [book, deskId]);

  // Matching the query and the scope, before the kind filter: the kind buttons count these.
  const matching = useMemo(() => {
    const inScope = (all ?? []).filter((c) => scope === 'all' || (scope === 'here') === (c.bookId === book.id));
    return filterCandidates(inScope, q);
  }, [all, scope, q, book.id]);
  const count = (k: PullKind | 'all') => matching.filter((c) => k === 'all' || c.kind === k).length;
  const groups = useMemo(() => groupCandidates(matching.filter((c) => kind === 'all' || c.kind === kind).slice(0, LIMIT), book.id), [matching, kind, book.id]);
  const list = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const bookList = useMemo(() => {
    const t = q.toLowerCase();
    return (books ?? []).filter((b) => b.id !== book.id && (!t || `${b.title} ${b.author ?? ''}`.toLowerCase().includes(t)));
  }, [books, book.id, q]);

  // The pills show while nothing is typed. Back to <book> leads, and is chosen at first: Alt+U then Enter goes again.
  const showActions = !q;
  const showAgain = !!(again && onGoAgain && onGoToBook && showActions);
  const actions = showActions ? [...(showAgain ? [AGAIN] : []), ...(onGoToBook ? [GO] : []), IMAGE] : [];
  const ids = picking ? bookList.map((b) => b.id) : [...actions, ...list.map((c) => c.key)];
  const active = selected && ids.includes(selected) ? selected : picking ? (bookList[0]?.id ?? null) : showAgain ? AGAIN : (list[0]?.key ?? (showActions ? IMAGE : null));
  const activeCandidate = list.find((c) => c.key === active);
  const pickedCandidates = picked.map((k) => (all ?? []).find((c) => c.key === k)).filter((c): c is PullCandidate => !!c);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

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
    rememberPullTarget(t);
  }

  function togglePicked(key: string) {
    if (!list.some((c) => c.key === key)) return;
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  const placedMessage = (t: PullTarget, n: number) =>
    t === 'inbox' ? (n > 1 ? `Added ${n} to the inbox and the desk` : 'Added to the inbox and the desk') : n > 1 ? `Placed ${n} in the ${t} Ḥāshiya` : `Placed in the ${t} Ḥāshiya`;

  /** Brings them onto the desk in order (collected ones stack at the spot in the order they were collected). */
  async function take(cs: PullCandidate[]) {
    if (busy.current || !cs.length) return;
    busy.current = true;
    try {
      for (const c of cs) await pullIn(book, deskId, c, target, spot);
      onToast(placedMessage(target, cs.length));
      onClose();
    } finally {
      busy.current = false;
    }
  }

  async function takeImage(file: File | undefined) {
    if (!isImageFile(file)) return onToast('That file is not an image');
    await pullInImage(book, deskId, file, target, spot);
    onToast(placedMessage(target, 1));
    onClose();
  }

  /** Enter, or the button: the collected ones, else the chosen row or pill. */
  function act(id: string | null = active) {
    if (picking) return goTo(id);
    if (pickedCandidates.length) return void take(pickedCandidates);
    if (id === AGAIN) onGoAgain?.();
    else if (id === GO) startPicking();
    else if (id === IMAGE) fileRef.current?.click();
    else {
      const c = list.find((x) => x.key === id);
      if (c) void take([c]);
    }
  }

  const targets: { t: PullTarget; label: string }[] = [
    ...(sides.includes('left') ? [{ t: 'left' as const, label: 'Left Ḥāshiya' }] : []),
    ...(sides.includes('right') ? [{ t: 'right' as const, label: 'Right Ḥāshiya' }] : []),
    { t: 'inbox', label: 'Inbox' },
  ];

  function onKeyDown(e: React.KeyboardEvent) {
    const at = active ? ids.indexOf(active) : -1;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (picked.length) setPicked([]);
      else if (picking) {
        setPicking(false);
        setQuery('');
        setSelected(null);
      } else onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(ids[Math.min(at + 1, ids.length - 1)] ?? null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(ids[Math.max(at - 1, 0)] ?? null);
    } else if (e.key === 'Tab' && e.target === inputRef.current && targets.length > 1) {
      e.preventDefault();
      const i = targets.findIndex((x) => x.t === target);
      chooseTarget(targets[(i + (e.shiftKey ? targets.length - 1 : 1)) % targets.length].t);
    } else if (e.key === 'Enter' && e.shiftKey && !picking) {
      e.preventDefault();
      if (active) togglePicked(active);
      setSelected(ids[Math.min(at + 1, ids.length - 1)] ?? null);
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      act();
    }
  }

  const where = target === 'inbox' ? 'the inbox' : `${target} Ḥāshiya`;
  const placeLabel = picking
    ? 'Go to'
    : pickedCandidates.length
      ? `Place ${pickedCandidates.length} in ${where}`
      : active === AGAIN
        ? 'Go back'
        : active === GO
          ? 'Choose a book'
          : active === IMAGE
            ? 'Choose a file'
            : `Place in ${where}`;

  const option = (id: string) => ({
    role: 'option' as const,
    'aria-selected': active === id,
    onMouseEnter: () => setSelected(id),
  });

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
      {!picking && (
        <div className="sd-inbox__desk sd-pull__filters">
          <span className="sd-seg" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.kind} type="button" aria-pressed={kind === f.kind} onClick={() => (setKind(f.kind), setSelected(null), inputRef.current?.focus())}>
                {f.label}
                {all && <b className="sd-pull__count">{count(f.kind)}</b>}
              </button>
            ))}
          </span>
          <span className="sd-seg sd-pull__scope" role="group" aria-label="From">
            {SCOPES.map((s) => (
              <button key={s.scope} type="button" aria-pressed={scope === s.scope} onClick={() => (setScope(s.scope), setSelected(null), inputRef.current?.focus())}>
                {s.label}
              </button>
            ))}
          </span>
        </div>
      )}
      {!spot && <p className="dsearch__hint sd-pull__note">The Ḥāshiya takes things only while a page is showing; this goes to the inbox.</p>}
      {picking ? (
        <div className="dsearch__results sd-pull__books" role="listbox" aria-label="Books" ref={listRef}>
          <p className="dsearch__hint">The book opens with a bar at the top. Capture there (Alt+X) and you come straight back here with it filed. Esc in the list goes back to Pull in.</p>
          {books === null && <p className="dsearch__hint">Loading…</p>}
          {books && !bookList.length && <p className="dsearch__hint">{q ? 'No book matches.' : 'No other books in the library.'}</p>}
          {bookList.map((b) => (
            <div key={b.id} {...option(b.id)} className={'dsearch__entry' + (b.id === active ? ' dsearch__entry--active' : '')} onClick={() => goTo(b.id)}>
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
      ) : (
        <div className="sd-pull__main">
          <div className="dsearch__results sd-pull__list" role="listbox" aria-label="Pull in" ref={listRef}>
            {showActions && (
              <div className="sd-pull__actions">
                {showAgain && again && (
                  <div {...option(AGAIN)} className={'sd-pull__act sd-pull__act--again' + (active === AGAIN ? ' is-active' : '')} onClick={onGoAgain}>
                    <IconAgain />
                    <span className="sd-pull__act-label">
                      Back to <bdi className={looksArabic(again.to.title) ? 'sd-pull__act-ar' : undefined}>{again.to.title}</bdi>
                    </span>
                  </div>
                )}
                {onGoToBook && (
                  <div {...option(GO)} className={'sd-pull__act' + (active === GO ? ' is-active' : '')} onClick={startPicking}>
                    <IconBook />
                    <span className="sd-pull__act-label">Go to another book…</span>
                  </div>
                )}
                <div {...option(IMAGE)} className={'sd-pull__act' + (active === IMAGE ? ' is-active' : '')} onClick={() => fileRef.current?.click()}>
                  <IconImage />
                  <span className="sd-pull__act-label">Image from a file…</span>
                </div>
              </div>
            )}
            {all === null && <p className="dsearch__hint">Loading…</p>}
            {all && !list.length && <p className="dsearch__hint">{q ? `Nothing matches “${q}”. Search looks at the text, notes, meanings and book titles.` : 'No highlights, words or other desks yet.'}</p>}
            {groups.map((g) => (
              <Fragment key={g.key}>
                <div className="sd-pull__group">
                  {g.here ? 'THIS BOOK' : <bdi className={looksArabic(g.title) ? 'sd-pull__group-ar' : undefined}>{g.title}</bdi>}
                  <i>{g.items.length}</i>
                </div>
                {g.items.map((c) => {
                  const on = picked.includes(c.key);
                  const text = c.text.length > 140 ? c.text.slice(0, 140) + '…' : c.text;
                  return (
                    <div
                      key={c.key}
                      {...option(c.key)}
                      className={'dsearch__entry sd-pull__row' + (c.key === active ? ' dsearch__entry--active' : '')}
                      onClick={(e) => (e.shiftKey ? togglePicked(c.key) : void take([c]))}
                    >
                      <button
                        type="button"
                        className={'sd-pull__tick' + (on ? ' is-on' : '')}
                        aria-pressed={on}
                        aria-label="Collect"
                        title="Collect (Shift+Enter)"
                        onClick={(e) => (e.stopPropagation(), togglePicked(c.key), inputRef.current?.focus())}
                      >
                        {on && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12 5 5 9-10" />
                          </svg>
                        )}
                      </button>
                      <div className="sd-pull__row-body">
                        <span className={c.ar ? 'dsearch__headword' : 'dsearch__headword sd-latin'} dir="auto" lang={c.ar ? 'ar' : undefined}>
                          <Marked s={text} query={q} />
                        </span>
                        {c.detail && (
                          <div className="sd-pull__detail" dir="auto">
                            <Marked s={c.detail} query={q} />
                          </div>
                        )}
                        <div className="sd-pull__meta">
                          <span className="dsearch__provider">{KIND_LABEL[c.kind]}</span>
                          {c.where && <bdi className="dsearch__meta">{c.where}</bdi>}
                          {c.onDesk && <span className="sd-pull__ondesk">On this desk</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <aside className="sd-pull__preview" aria-label="Preview">
            {pickedCandidates.length ? (
              <>
                <div className="sd-pull__label">COLLECTED · {pickedCandidates.length}</div>
                <ol className="sd-pull__picked">
                  {pickedCandidates.map((c) => (
                    <li key={c.key} className={c.ar ? 'sd-pull__picked-ar' : undefined} dir="auto">
                      {c.text.length > 60 ? c.text.slice(0, 60) + '…' : c.text}
                    </li>
                  ))}
                </ol>
              </>
            ) : activeCandidate ? (
              <>
                <div className={'sd-pull__pv-text' + (activeCandidate.ar ? '' : ' sd-latin')} dir="auto" lang={activeCandidate.ar ? 'ar' : undefined}>
                  {activeCandidate.text}
                </div>
                {activeCandidate.detail && (
                  <div className="sd-pull__pv-note" dir="auto">
                    {activeCandidate.detail}
                  </div>
                )}
                <div className="sd-pull__pv-from">
                  {KIND_LABEL[activeCandidate.kind]} from <bdi>{activeCandidate.bookId === book.id ? 'this book' : (activeCandidate.bookTitle ?? 'another book')}</bdi>
                  {activeCandidate.where && (
                    <>
                      , <bdi>{activeCandidate.where}</bdi>
                    </>
                  )}
                </div>
              </>
            ) : active === AGAIN && again ? (
              <div className="sd-pull__pv-note">
                Opens <bdi>{again.to.title}</bdi> with a bar at the top. Capture there (Alt+X) and you come straight back, with it filed {againWhere(again)}.
              </div>
            ) : active === GO ? (
              <div className="sd-pull__pv-note">Pick a book; capture there (Alt+X) and you come straight back with it filed.</div>
            ) : active === IMAGE ? (
              <div className="sd-pull__pv-note">An image from this device goes on the desk as a screenshot.</div>
            ) : null}
            <div className="sd-pull__lands">
              <div className="sd-pull__label">LANDS IN</div>
              <LandsIn target={target} />
              <div className="sd-pull__keys">
                <span>
                  <kbd>Shift ↵</kbd> Collect
                </span>
                <span>
                  <kbd>Tab</kbd> Place in
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Image file" onChange={(e) => void takeImage(e.target.files?.[0])} />
      <div className="sd-pull__foot">
        <span className="sd-seg" role="group" aria-label="Place in">
          {targets.map(({ t, label }) => (
            <button key={t} type="button" aria-pressed={target === t} onClick={() => (chooseTarget(t), inputRef.current?.focus())}>
              {label}
            </button>
          ))}
        </span>
        <button type="button" className="sd-pull__place" disabled={!active && !pickedCandidates.length} onClick={() => act()}>
          {placeLabel} <kbd>↵</kbd>
        </button>
      </div>
    </div>
  );
}
