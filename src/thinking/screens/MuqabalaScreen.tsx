import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addLink, deleteLink, restoreLink, updateLink } from '../../studyDesk/deskStore';
import type { DeskItem, DeskLink, DeskRel } from '../../studyDesk/types';
import { useDeskImage } from '../../studyDesk/useDesk';
import { bookPassages, booksWithPassages, linksAcross, pickPassage, relLabel, RELATIONS, wirePath, type Pick } from '../muqabala';
import { goToItem, type OpenBook } from '../nav';
import { citeOf, pageOf, short } from '../passages';
import { say } from '../say';
import type { Screen } from '../state';
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
}

/**
 * Muqābala: two books side by side, each pane its passages page by page. Click a passage on one side, then one on the
 * other, and name how they relate. Lines join linked passages across the gap, with the relation on a chip; under 900px
 * the panes stack and the links are listed instead.
 */
export function MuqabalaScreen({ screen, onOpenBook }: { screen: Extract<Screen, { kind: 'muqabala' }>; onOpenBook?: OpenBook }) {
  const data = useThinkingData();
  const narrow = useNarrow();
  const books = useMemo(() => booksWithPassages(data.items), [data.items]);
  const [chosen, setChosen] = useState<{ a?: string; b?: string }>({});
  const [pick, setPick] = useState<Pick>({ pick: null, pair: null });
  const [active, setActive] = useState<string | null>(screen.link ?? null);
  const [started, setStarted] = useState(false);

  // Where the screen starts: a link's two books, or a passage picked on the left (Compare, Alt+J).
  if (data.loaded && !started) {
    setStarted(true);
    const link = screen.link ? data.links.find((l) => l.id === screen.link) : undefined;
    const from = screen.a ? data.byId.get(screen.a) : undefined;
    if (link) setChosen({ a: data.byId.get(link.a)?.source?.bookId, b: data.byId.get(link.b)?.source?.bookId });
    else if (from?.source) {
      setChosen({ a: from.source.bookId, b: books.find((x) => x.bookId !== from.source!.bookId)?.bookId });
      setPick({ pick: { id: from.id, side: 'a' }, pair: null });
    }
  }
  const a = chosen.a ?? books[0]?.bookId;
  const b = chosen.b ?? books.find((x) => x.bookId !== a)?.bookId ?? a;
  const left = useMemo(() => (a ? bookPassages(data.items, a) : []), [data.items, a]);
  const right = useMemo(() => (b ? bookPassages(data.items, b) : []), [data.items, b]);
  const across = useMemo(() => (a && b ? linksAcross(data.links, data.byId, a, b) : []), [data.links, data.byId, a, b]);
  const titleOf = (id?: string) => books.find((x) => x.bookId === id)?.title ?? 'A book';

  // The lines: measured once the panes are laid out, again when they change size.
  const boxRef = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || narrow) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(box);
    return () => ro.disconnect();
  }, [narrow]);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || narrow) return setWires([]);
    const r0 = box.getBoundingClientRect();
    const paneA = box.querySelector('[data-side="a"]')?.getBoundingClientRect();
    const paneB = box.querySelector('[data-side="b"]')?.getBoundingClientRect();
    if (!paneA || !paneB) return setWires([]);
    const out: Wire[] = [];
    for (const { link, left: l, right: r } of across) {
      const ea = box.querySelector(`[data-side="a"] [data-psg="${l.id}"]`)?.getBoundingClientRect();
      const eb = box.querySelector(`[data-side="b"] [data-psg="${r.id}"]`)?.getBoundingClientRect();
      if (!ea || !eb) continue;
      const x1 = paneA.right - r0.left;
      const y1 = ea.top + Math.min(ea.height / 2, 28) - r0.top;
      const x2 = paneB.left - r0.left;
      const y2 = eb.top + Math.min(eb.height / 2, 28) - r0.top;
      out.push({ id: link.id, rel: link.rel, d: wirePath(x1, y1, x2, y2), x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    }
    setWires(out);
  }, [across, narrow, tick, left, right]);

  if (!data.loaded) return <div className="th-screen th-screen--loading" role="status">Loading…</div>;
  if (books.length === 0)
    return (
      <Frame eyebrow="Muqābala" title="Two books side by side">
        <p className="th-sub">Muqābala links passages you have kept from two books. Highlight a passage or two in each book first (or tag them with a move), then come back.</p>
      </Frame>
    );

  const click = (id: string, side: 'a' | 'b') => {
    const next = pickPassage(pick, id, side);
    setPick(next);
    if (next.pair) setActive(null);
  };
  const link = active ? data.links.find((l) => l.id === active) : undefined;
  const hint = pick.pair ? 'Name how they relate, below.' : pick.pick ? 'Now click a passage on the other side.' : 'Click a passage, then one on the other side, to link them.';

  const pane = (side: 'a' | 'b', bookId: string | undefined, list: DeskItem[]) => (
    <section className="th-pane" data-side={side} aria-label={titleOf(bookId)}>
      <div className="th-pane__head">
        <select
          className="th-switch"
          aria-label={side === 'a' ? 'Book on the left' : 'Book on the right'}
          value={bookId}
          onChange={(e) => {
            setChosen({ ...chosen, a, b, [side]: e.target.value });
            setPick({ pick: null, pair: null });
          }}
        >
          {books.map((x) => (
            <option key={x.bookId} value={x.bookId}>
              {x.title} ({x.passages})
            </option>
          ))}
        </select>
      </div>
      {list.map((item, i) => (
        <div key={item.id}>
          {(i === 0 || pageOf(list[i - 1]) !== pageOf(item)) && <p className="th-pane__page">{item.source?.chapterLabel || citeOf(item)}</p>}
          <PanePassage item={item} picked={pick.pick?.id === item.id || pick.pair?.[side] === item.id} onClick={() => click(item.id, side)} />
        </div>
      ))}
      {!list.length && <p className="th-empty">No passages kept from this book yet.</p>}
    </section>
  );

  return (
    <Frame eyebrow="Muqābala" title={`${titleOf(a)} beside ${titleOf(b)}`} wide>
      <p className="th-sub">{hint}</p>
      <div className={'th-cmp' + (narrow ? ' th-cmp--narrow' : '')} ref={boxRef}>
        {pane('a', a, left)}
        {!narrow && <div className="th-cmp__gap" aria-hidden="true" />}
        {pane('b', b, right)}
        {!narrow && (
          <svg className="th-wires" aria-hidden="true">
            {wires.map((w) => (
              <path key={w.id} className="th-wire" data-rel={w.rel} d={w.d} data-on={w.id === active} />
            ))}
          </svg>
        )}
        {!narrow &&
          wires.map((w) => (
            <button key={w.id} type="button" className="th-relchip" data-rel={w.rel} style={{ left: w.x, top: w.y }} aria-pressed={w.id === active} onClick={() => setActive(w.id === active ? null : w.id)}>
              {relLabel(w.rel)}
            </button>
          ))}
      </div>
      {narrow && across.length > 0 && (
        <div className="th-cmp-list">
          {across.map(({ link: l, left: x, right: y }) => (
            <button key={l.id} type="button" className="th-cmp-list__row" aria-pressed={l.id === active} onClick={() => setActive(l.id === active ? null : l.id)}>
              <b>{relLabel(l.rel)}</b> <bdi>{short(x.text, 34)}</bdi> ↔ <bdi>{short(y.text, 34)}</bdi>
            </button>
          ))}
        </div>
      )}
      {pick.pair && <NewLink pair={pick.pair} byId={data.byId} onDone={(id) => (setPick({ pick: null, pair: null }), setActive(id))} onCancel={() => setPick({ pick: null, pair: null })} />}
      {link && !pick.pair && <LinkNote key={link.id} link={link} byId={data.byId} onGoTo={(item) => void goToItem(item, onOpenBook)} onDeleted={() => setActive(null)} />}
      <section className="th-panel">
        <h2 className="th-h2">All links in your library</h2>
        {!data.links.length && <p className="th-empty">None yet.</p>}
        <div className="th-list">
          {data.links.map((l) => {
            const x = data.byId.get(l.a);
            const y = data.byId.get(l.b);
            if (!x || !y) return null;
            return (
              <button
                key={l.id}
                type="button"
                className="th-cmp-all"
                onClick={() => {
                  setChosen({ a: x.source?.bookId, b: y.source?.bookId });
                  setPick({ pick: null, pair: null });
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
    </Frame>
  );
}

function PanePassage({ item, picked, onClick }: { item: DeskItem; picked: boolean; onClick(): void }) {
  const img = useDeskImage(item.type === 'capture' ? item.imageHash : undefined);
  return (
    <button type="button" className="th-cmp-psg" data-psg={item.id} aria-pressed={picked} onClick={onClick}>
      {img ? <img src={img} alt={item.text} /> : <span className={item.ar ? 'th-ar' : undefined} dir="auto">{item.text}</span>}
    </button>
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
      <textarea className="th-input" dir="auto" rows={2} value={note} placeholder="What do you see across the gap? (optional)" aria-label="Note on the link" onChange={(e) => setNote(e.target.value)} />
      <div className="th-row">
        {RELATIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="sd-btn"
            data-rel={r.id}
            onClick={() => void addLink({ a: pair.a, b: pair.b, rel: r.id, note: note.trim() }).then((l) => (say(`Linked: ${r.label}`), onDone(l.id)))}
          >
            {r.label}
          </button>
        ))}
        <button type="button" className="sd-btn th-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** The chosen link: its relation, its note (edited in place), both passages, and Delete with Undo. */
function LinkNote({ link, byId, onGoTo, onDeleted }: { link: DeskLink; byId: Map<string, DeskItem>; onGoTo(item: DeskItem): void; onDeleted(): void }) {
  const [note, setNote] = useState(link.note);
  const x = byId.get(link.a);
  const y = byId.get(link.b);
  return (
    <section className="th-panel th-linknote" aria-label="Link">
      <div className="th-row">
        <span className="th-eyebrow">{relLabel(link.rel)}</span>
        <select className="th-switch" aria-label="Relation" value={link.rel} onChange={(e) => void updateLink(link.id, { rel: e.target.value as DeskRel })}>
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="th-input th-linknote__text"
        dir="auto"
        rows={2}
        value={note}
        placeholder="What do you see across the gap?"
        aria-label="Note on the link"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== link.note && void updateLink(link.id, { note })}
      />
      <div className="th-row">
        {[x, y].map((p) =>
          p ? (
            <button key={p.id} type="button" className="th-src" onClick={() => onGoTo(p)}>
              <bdi>{citeOf(p)}</bdi>
            </button>
          ) : null
        )}
        <span className="th-faint">Shows as a touch on both passages in the reader.</span>
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
      </div>
    </section>
  );
}
