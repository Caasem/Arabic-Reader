import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { libraryService } from '../../library/libraryService';
import { hasPdfChoice, loadPdfView } from '../../pdf/pages/pdfView';
import { usePreferences } from '../../state/PreferencesContext';
import { currentDeskId } from '../../studyDesk/deskMemory';
import { addLink, bookDeskId, deleteLink, restoreLink, updateLink } from '../../studyDesk/deskStore';
import type { DeskItem, DeskLink, DeskRel } from '../../studyDesk/types';
import { capture, looksArabic } from '../../studyDesk/useDesk';
import type { BookMeta } from '../../types';
import { LivePane, type Kept, type LivePaneHandle } from '../live/LivePane';
import { anchorIn, viewFor, type LiveView } from '../live/places';
import { bookPassages, booksWithPassages, linksAcross, pickPassage, relLabel, RELATIONS, wirePath, type Pick } from '../muqabala';
import { goToItem, type OpenBook } from '../nav';
import { citeOf, short } from '../passages';
import { say } from '../say';
import { readingBook, type Screen } from '../state';
import { useThinkingData } from '../useThinkingData';
import { Frame } from './Frame';

const NARROW = '(max-width: 900px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

interface Wire {
  id: string;
  rel: DeskRel;
  d: string;
  x: number;
  y: number;
  /** One end is scrolled out of its pane: the line points at the pane's edge. */
  off: boolean;
}

type Side = 'a' | 'b';
/** What one pane shows: a book, in which view, opening at which passage (`n` remounts it to open there again). */
interface Pane {
  bookId?: string;
  view: LiveView;
  start?: string;
  n: number;
}

const viewOf = (book: BookMeta | undefined, item?: DeskItem): LiveView => (book?.pdf ? (hasPdfChoice(book) ? viewFor(item, loadPdfView(book)) : 'pages') : 'text');

/**
 * Muqābala: two books open side by side, live: their own text, or their PDF pages. Passages kept from each are marked;
 * click one on each side (or select new words and keep them), then name how they relate. Lines join linked passages
 * across the gap and follow both sides as they scroll, with the relation on a chip; under 900px the panes stack and
 * the links are listed instead.
 */
export function MuqabalaScreen({ screen, onOpenBook }: { screen: Extract<Screen, { kind: 'muqabala' }>; onOpenBook?: OpenBook }) {
  const data = useThinkingData();
  const { prefs } = usePreferences();
  const narrow = useNarrow();
  const [library, setLibrary] = useState<BookMeta[] | null>(null);
  useEffect(() => {
    void libraryService.listBooks().then((all) => setLibrary([...all].sort((x, y) => (y.updatedAt ?? y.addedAt) - (x.updatedAt ?? x.addedAt))));
  }, []);
  const counts = useMemo(() => new Map(booksWithPassages(data.items).map((b) => [b.bookId, b.passages])), [data.items]);
  // Books with kept passages first, most first; then the rest, most recent first.
  const books = useMemo(() => (library ? [...library].sort((x, y) => (counts.get(y.id) ?? 0) - (counts.get(x.id) ?? 0)) : []), [library, counts]);
  const bookOf = useCallback((id?: string) => books.find((x) => x.id === id), [books]);

  const [panes, setPanes] = useState<Record<Side, Pane> | null>(null);
  const [pick, setPick] = useState<Pick>({ pick: null, pair: null });
  const [active, setActive] = useState<string | null>(screen.link ?? null);

  // Where the screen starts: a link's two books, a passage on the left (Compare, Alt+J), else the book being read (or
  // the one most kept from) beside the next most kept from.
  if (data.loaded && library && !panes) {
    const link = screen.link ? data.links.find((l) => l.id === screen.link) : undefined;
    const x = link ? data.byId.get(link.a) : screen.a ? data.byId.get(screen.a) : undefined;
    const y = link ? data.byId.get(link.b) : undefined;
    const a = x?.source?.bookId ?? bookOf(readingBook()?.id)?.id ?? books[0]?.id;
    const b = y?.source?.bookId ?? books.find((k) => k.id !== a)?.id ?? a;
    setPanes({
      a: { bookId: a, view: viewOf(bookOf(a), x), start: x?.id, n: 0 },
      b: { bookId: b, view: viewOf(bookOf(b), y), start: y?.id, n: 0 },
    });
    if (x && !link) setPick({ pick: { id: x.id, side: 'a' }, pair: null });
  }
  const a = panes?.a.bookId;
  const b = panes?.b.bookId;
  const left = useMemo(() => (a ? bookPassages(data.items, a) : []), [data.items, a]);
  const right = useMemo(() => (b ? bookPassages(data.items, b) : []), [data.items, b]);
  const across = useMemo(() => (a && b ? linksAcross(data.links, data.byId, a, b) : []), [data.links, data.byId, a, b]);
  const titleOf = (id?: string) => bookOf(id)?.title ?? 'A book';

  // The lines: from each passage's height in its pane, redrawn as either pane scrolls or lays out again.
  const boxRef = useRef<HTMLDivElement>(null);
  const paneA = useRef<LivePaneHandle>(null);
  const paneB = useRef<LivePaneHandle>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  // A new pair: bring the relation buttons into view under the panes.
  const noteRef = useRef<HTMLDivElement>(null);
  const paired = !!pick.pair;
  useEffect(() => {
    if (paired) noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [paired]);
  const raf = useRef(0);
  const draw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const box = boxRef.current?.getBoundingClientRect();
      const ra = paneA.current?.box();
      const rb = paneB.current?.box();
      if (!box || !ra || !rb || narrow) return setWires([]);
      const out: Wire[] = [];
      for (const { link, left: l, right: r } of across) {
        const ea = anchorIn(paneA.current!.yOf(l.id), paneA.current!.before(l.id), ra.top, ra.bottom);
        const eb = anchorIn(paneB.current!.yOf(r.id), paneB.current!.before(r.id), rb.top, rb.bottom);
        if (ea.off && eb.off && link.id !== active) continue;
        const x1 = ra.right - box.left;
        const y1 = ea.y - box.top;
        const x2 = rb.left - box.left;
        const y2 = eb.y - box.top;
        out.push({
          id: link.id,
          rel: link.rel,
          d: wirePath(x1, y1, x2, y2),
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          off: ea.off || eb.off,
        });
      }
      setWires(out);
    });
  }, [across, narrow, active]);
  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => {
      window.removeEventListener('resize', draw);
      cancelAnimationFrame(raf.current);
    };
  }, [draw, left, right]);

  if (!data.loaded || !library || !panes)
    return (
      <div className="th-screen th-screen--loading" role="status">
        Loading…
      </div>
    );
  if (books.length === 0)
    return (
      <Frame eyebrow="Muqābala" title="Two books side by side">
        <p className="th-sub">Muqābala opens two books side by side. Add a book to your library first.</p>
      </Frame>
    );

  const handle = (side: Side) => (side === 'a' ? paneA : paneB).current;
  const setPane = (side: Side, pane: Partial<Pane>) => setPanes((p) => p && { ...p, [side]: { ...p[side], ...pane, n: p[side].n + 1 } });
  /** Shows a passage in its pane: scrolls to it, or opens the view it was kept in. */
  const show = (side: Side, item: DeskItem) => {
    if (handle(side)?.reveal(item.id)) return;
    const book = bookOf(item.source?.bookId);
    setPane(side, { view: viewOf(book, item), start: item.id });
  };
  const choose = (id: string | null) => {
    setActive(id);
    const found = id ? across.find((x) => x.link.id === id) : undefined;
    if (found) {
      show('a', found.left);
      show('b', found.right);
    }
  };
  const click = (id: string, side: Side) => {
    setPick((was) => {
      const next = pickPassage(was, id, side);
      if (next.pair) setActive(null);
      return next;
    });
  };
  const keep = async (side: Side, kept: Kept) => {
    const book = bookOf(panes[side].bookId);
    if (!book) return;
    const item = await capture(
      book,
      currentDeskId(book.id) ?? bookDeskId(book.id),
      {
        type: kept.text ? 'quote' : 'capture',
        text: kept.text || `Region of ${kept.chapterLabel.toLowerCase()}`,
        ar: looksArabic(kept.text),
        source: {
          bookId: book.id,
          bookTitle: book.title,
          location: kept.location,
          chapterLabel: kept.chapterLabel,
        },
        inInbox: prefs.studyDeskMarginsToInbox === 'auto',
      },
      kept.image,
    );
    say('Kept');
    click(item.id, side);
  };
  const link = active ? data.links.find((l) => l.id === active) : undefined;
  const on = new Set(link ? [link.a, link.b] : []);
  const linked = new Set(across.flatMap((x) => [x.left.id, x.right.id]));
  const hint = pick.pair
    ? 'Name how they relate, below.'
    : pick.pick
      ? 'Now click a passage on the other side, or select words there.'
      : 'Click a passage, then one on the other side, to link them. Or select words to keep new ones.';

  const pane = (side: Side) => {
    const p = panes[side];
    const book = bookOf(p.bookId);
    return (
      <section className="th-pane th-pane--live" data-side={side} aria-label={titleOf(p.bookId)}>
        <div className="th-pane__head">
          {/* The book's title is its picker: books kept from first, then the rest of the library. */}
          <select
            className="th-pane__title"
            dir="auto"
            aria-label={side === 'a' ? 'Book on the left' : 'Book on the right'}
            value={p.bookId}
            onChange={(e) => {
              const next = bookOf(e.target.value);
              setPane(side, { bookId: e.target.value, view: viewOf(next), start: undefined });
              setPick({ pick: null, pair: null });
            }}
          >
            {[books.filter((x) => counts.has(x.id)), books.filter((x) => !counts.has(x.id))].map(
              (group, g) =>
                group.length > 0 && (
                  <optgroup key={g} label={g === 0 ? 'Books you have kept passages from' : 'Other books'}>
                    {group.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </select>
          {book && hasPdfChoice(book) && (
            <div className="th-seg" role="group" aria-label="Show as">
              {(['text', 'pages'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={p.view === v} onClick={() => p.view !== v && setPane(side, { view: v, start: undefined })}>
                  {v === 'text' ? 'Text' : 'PDF pages'}
                </button>
              ))}
            </div>
          )}
        </div>
        {book && (
          <LivePane
            key={`${book.id}:${p.view}:${p.n}`}
            ref={side === 'a' ? paneA : paneB}
            book={book}
            view={p.view}
            passages={side === 'a' ? left : right}
            picked={pick.pick?.side === side ? pick.pick.id : (pick.pair?.[side] ?? null)}
            linked={linked}
            on={on}
            start={p.start}
            onPick={(id) => click(id, side)}
            onKeep={(kept) => keep(side, kept)}
            onMove={draw}
          />
        )}
      </section>
    );
  };

  return (
    <Frame eyebrow="Muqābala" title={`${titleOf(a)} beside ${titleOf(b)}`} wide beside={<p className="th-sub th-cmp-hint">{hint}</p>}>
      <div className={'th-cmp th-cmp--live' + (narrow ? ' th-cmp--narrow' : '')} ref={boxRef}>
        {pane('a')}
        {!narrow && <div className="th-cmp__gap" aria-hidden="true" />}
        {pane('b')}
        {!narrow && (
          <svg className="th-wires" aria-hidden="true">
            {wires.map((w) => (
              <path key={w.id} className="th-wire" data-rel={w.rel} d={w.d} data-on={w.id === active} data-off={w.off || undefined} />
            ))}
          </svg>
        )}
        {!narrow &&
          wires.map((w) => (
            <button
              key={w.id}
              type="button"
              className="th-relchip"
              data-rel={w.rel}
              style={{ left: w.x, top: w.y }}
              aria-pressed={w.id === active}
              onClick={() => choose(w.id === active ? null : w.id)}
            >
              {relLabel(w.rel)}
            </button>
          ))}
      </div>
      {narrow && across.length > 0 && (
        <div className="th-cmp-list">
          {across.map(({ link: l, left: x, right: y }) => (
            <button key={l.id} type="button" className="th-cmp-list__row" aria-pressed={l.id === active} onClick={() => choose(l.id === active ? null : l.id)}>
              {relLabel(l.rel)}: <bdi>{short(x.text, 30)}</bdi> ↔ <bdi>{short(y.text, 30)}</bdi>
            </button>
          ))}
        </div>
      )}
      <div className="th-cmp-note" ref={noteRef}>
        {pick.pair ? (
          <NewLink pair={pick.pair} byId={data.byId} onDone={(id) => (setPick({ pick: null, pair: null }), setActive(id))} onCancel={() => setPick({ pick: null, pair: null })} />
        ) : link ? (
          <LinkNote
            key={link.id}
            link={link}
            byId={data.byId}
            onGoTo={(item) => void goToItem(item, onOpenBook)}
            onDeleted={() => setActive(null)}
            onClose={() => setActive(null)}
          />
        ) : (
          <div />
        )}
        <section className="th-panel">
          <span className="th-eyebrow">All links in your library</span>
          {!data.links.length && <p className="th-empty">None yet.</p>}
          <div className="th-lines">
            {data.links.map((l) => {
              const x = data.byId.get(l.a);
              const y = data.byId.get(l.b);
              if (!x || !y) return null;
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === active}
                  onClick={() => {
                    setPick({ pick: null, pair: null });
                    // These two books already: scroll to the link. Otherwise open its books.
                    if (across.some((c) => c.link.id === l.id)) return choose(l.id);
                    const bx = bookOf(x.source?.bookId);
                    const by = bookOf(y.source?.bookId);
                    setPanes(
                      (p) =>
                        p && {
                          a: {
                            bookId: bx?.id,
                            view: viewOf(bx, x),
                            start: x.id,
                            n: p.a.n + 1,
                          },
                          b: {
                            bookId: by?.id,
                            view: viewOf(by, y),
                            start: y.id,
                            n: p.b.n + 1,
                          },
                        },
                    );
                    setActive(l.id);
                  }}
                >
                  <span>
                    {relLabel(l.rel)} · <bdi>{citeOf(x)}</bdi> ↔ <bdi>{citeOf(y)}</bdi>
                  </span>
                  {l.note && <span className="th-faint">{short(l.note, 90)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Frame>
  );
}

/** Naming a new link: the two passages, the five relations, and an optional note. */
function NewLink({ pair, byId, onDone, onCancel }: { pair: { a: string; b: string }; byId: Map<string, DeskItem>; onDone(id: string): void; onCancel(): void }) {
  const [note, setNote] = useState('');
  const x = byId.get(pair.a);
  const y = byId.get(pair.b);
  if (!x || !y) return null;
  return (
    <section className="th-panel th-newlink" aria-label="New link">
      <span className="th-eyebrow">New link</span>
      {[x, y].map((p) => (
        <p key={p.id} className={'th-excerpt' + (p.ar ? ' th-ar' : '')} dir="auto">
          {short(p.text, 90)} <span className="th-faint">· {citeOf(p)}</span>
        </p>
      ))}
      <div className="th-relpick">
        {RELATIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="sd-btn"
            onClick={() =>
              void addLink({
                a: pair.a,
                b: pair.b,
                rel: r.id,
                note: note.trim(),
              }).then((l) => (say(`Linked: ${r.label}`), onDone(l.id)))
            }
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        className="th-input"
        dir="auto"
        rows={3}
        value={note}
        placeholder="What do you see across the gap?"
        aria-label="Note on the link"
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="th-row th-row--end">
        <button type="button" className="sd-btn th-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** The chosen link: its relation, its note (edited in place), both passages, and Delete with Undo. */
function LinkNote({ link, byId, onGoTo, onDeleted, onClose }: { link: DeskLink; byId: Map<string, DeskItem>; onGoTo(item: DeskItem): void; onDeleted(): void; onClose(): void }) {
  const [note, setNote] = useState(link.note);
  const x = byId.get(link.a);
  const y = byId.get(link.b);
  return (
    <section className="th-panel th-linknote" aria-label="Link">
      <span className="th-eyebrow">{relLabel(link.rel)}</span>
      <textarea
        className="th-linknote__text"
        dir="auto"
        rows={2}
        value={note}
        placeholder="What do you see across the gap?"
        aria-label="Note on the link"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== link.note && void updateLink(link.id, { note })}
      />
      <div className="th-linkcite">
        {[x, y].map((p) =>
          p ? (
            <button key={p.id} type="button" className="th-src" title={`Go to ${citeOf(p)}`} onClick={() => onGoTo(p)}>
              <bdi>{citeOf(p)}</bdi>
            </button>
          ) : null,
        )}
        <span className="th-faint">Shows as a touch on both passages in the reader.</span>
      </div>
      <div className="th-row th-row--end">
        <select className="th-switch" aria-label="Relation" value={link.rel} onChange={(e) => void updateLink(link.id, { rel: e.target.value as DeskRel })}>
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="th-link"
          onClick={() =>
            void deleteLink(link.id).then(() => {
              onDeleted();
              say('Link deleted', () => restoreLink(link));
            })
          }
        >
          Delete link
        </button>
        <button type="button" className="sd-btn th-btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
