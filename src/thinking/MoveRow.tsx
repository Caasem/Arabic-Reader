import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCleanLocation } from '../readerCore/location';
import { offsetWithin } from '../quietReader/textOffsets';
import { joinThread, updateItem } from '../studyDesk/deskStore';
import { capture, looksArabic } from '../studyDesk/useDesk';
import type { BookMeta } from '../types';
import { usePdfDesk } from '../studyDesk/pdfDesk';
import type { DeskItem, DeskMove } from '../studyDesk/types';
import { moveForKey, moveInfo, MOVES, movePatch, tieCandidates, tieKind, tieQuestion } from './moves';
import { citeOf, short } from './passages';
import { say } from './say';
import { setThinking, thinkingState } from './state';

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

/** The five moves as buttons: Arabic name, English name, key. */
export function MoveButtons({ current, onPick }: { current?: DeskMove; onPick(move: DeskMove): void }) {
  return (
    <div className="th-moves" role="group" aria-label="What is this passage doing?">
      {MOVES.map((m) => (
        <button key={m.id} type="button" className="th-move" data-m={m.id} aria-pressed={current === m.id} title={`${m.en} (${m.key})`} onClick={() => onPick(m.id)}>
          <span className="th-ar">{m.ar}</span>
          <small>
            {m.en} <kbd>{m.key}</kbd>
          </small>
        </button>
      ))}
    </div>
  );
}

/** Keys 1–5 pick a move while `on`, unless typing or a modifier is held. */
function useMoveKeys(on: boolean, pick: (m: DeskMove) => void) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || typing(e.target)) return;
      const m = moveForKey(e.key);
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      pick(m);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [on, pick]);
}

/** A move was set on a passage: say so, and join the active thread (new moves join it). */
async function afterMove(item: DeskItem, move: DeskMove | undefined, collect: boolean) {
  const active = thinkingState().active;
  if (move && collect && active && !item.threads?.includes(active)) await joinThread([item.id], active);
  say(move ? `Marked as ${moveInfo(move).en} · ${moveInfo(move).ar}` : 'Move taken off');
}

/** The passage bar's moves, and after Evidence, Objection or Reply, what it ties to. */
export function PassageMoves({ item, items, collect }: { item: DeskItem; items: DeskItem[]; collect: boolean }) {
  // Just tagged on a fresh selection: ask the tie straight away.
  const [asking, setAsking] = useState<DeskMove | null>(() => (thinkingState().askTie === item.id && item.move && tieKind(item.move) && !item.tie ? item.move : null));
  useEffect(() => {
    if (thinkingState().askTie === item.id) setThinking({ askTie: null });
  }, [item.id]);
  const pick = (move: DeskMove) => {
    const patch = movePatch(item, move);
    void updateItem(item.id, patch).then(() => afterMove(item, patch.move, collect));
    setAsking(patch.move && tieKind(patch.move) ? patch.move : null);
  };
  useMoveKeys(!asking, pick);
  const choices = asking ? tieCandidates(item, asking, items, { thread: thinkingState().active, bookId: item.source?.bookId }).slice(0, 6) : [];
  const want = asking ? tieKind(asking) : null;
  return (
    <>
      <MoveButtons current={item.move} onPick={pick} />
      {asking && want && (
        <div className="th-ties" role="group" aria-label={tieQuestion(asking)}>
          <span className="th-eyebrow">{tieQuestion(asking)}</span>
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setAsking(null);
                void updateItem(item.id, { tie: c.id }).then(() => say(`Tied to “${short(c.text || c.body || '', 40)}”`));
              }}
            >
              <span className="th-mchip" data-m={want}>
                {moveInfo(want).ar}
              </span>
              <span className={c.ar ? 'th-ar' : undefined} dir="auto">
                {short(c.text || c.body || '', 64)}
              </span>
              <span className="th-faint">{c.source?.bookId === item.source?.bookId ? 'this book' : citeOf(c) || 'yours'}</span>
            </button>
          ))}
          {!choices.length && <p className="th-faint">Nothing to tie to yet: mark a {moveInfo(want).en.toLowerCase()} first.</p>}
          <button type="button" className="th-ties__loose" onClick={() => setAsking(null)}>
            Leave it loose for now
          </button>
        </div>
      )}
    </>
  );
}

/** Words chosen but not kept yet: a move keeps them as a quote with that move and opens its bar to ask the tie. */
function PendingRow({ keep, collect }: { keep(extra: Partial<DeskItem>): Promise<DeskItem | null>; collect: boolean }) {
  const pick = (move: DeskMove) =>
    void keep({ move }).then(async (item) => {
      if (!item) return;
      await afterMove(item, move, collect);
      setThinking({ selected: item.id, touch: null, askTie: tieKind(move) ? item.id : null });
    });
  useMoveKeys(true, pick);
  return <MoveButtons onPick={pick} />;
}

/** On PDF pages: the moves just under the Highlighter's bar, while words wait there. */
export function PdfPendingMoves({ collect }: { collect: boolean }) {
  const { pending } = usePdfDesk();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // The Highlighter's bar follows the page as it scrolls; follow the bar.
  useEffect(() => {
    if (!pending) return;
    let raf = 0;
    const place = () => {
      const bar = document.querySelector('.sd-pdfsel__bar')?.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 60;
      if (bar) setPos({ left: bar.left, top: bar.bottom + h + 12 < window.innerHeight ? bar.bottom + 6 : Math.max(8, bar.top - h - 6) });
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [pending]);
  if (!pending) return null;
  return (
    <div ref={ref} className="th-selmoves" style={pos ?? { left: -9999, top: -9999 }} onPointerDown={(e) => e.stopPropagation()}>
      <PendingRow keep={pending} collect={collect} />
    </div>
  );
}

interface QuietSelection {
  location: string;
  text: string;
  chapterLabel: string;
  rect: { left: number; right: number; top: number; bottom: number };
}

const sectionOf = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.qr-chapter') ?? null;

/** The quiet reader's selection as a `clean:` place, when it lies in one chapter. */
function readSelection(): QuietSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const section = sectionOf(range.startContainer);
  if (!section || section !== sectionOf(range.endContainer)) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const start = offsetWithin(section, range.startContainer, range.startOffset);
  const end = offsetWithin(section, range.endContainer, range.endOffset);
  if (end <= start) return null;
  const chapter = Number(section.dataset.chapter);
  const heading = section.querySelector('h1, h2, h3')?.textContent?.trim();
  const r = range.getBoundingClientRect();
  return { location: formatCleanLocation({ chapter, start, end }), text, chapterLabel: heading || `Chapter ${chapter + 1}`, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
}

/**
 * In the quiet reader: a slim bar of moves under selected text (the reader's highlight colours stay above it). A move
 * keeps the words as a quote on the current desk, with that move, and opens its passage bar.
 */
export function QuietPendingMoves({ book, deskId, toInbox, collect }: { book: BookMeta; deskId: string; toInbox: boolean; collect: boolean }) {
  const [sel, setSel] = useState<QuietSelection | null>(null);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSel(readSelection()));
    };
    document.addEventListener('selectionchange', read);
    document.addEventListener('scroll', read, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', read);
      document.removeEventListener('scroll', read, true);
    };
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!sel || !el) return setPos(null);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Below the selection, unless the reader's colour bar went there for want of room above.
    const selbar = document.querySelector('.qr-selbar')?.getBoundingClientRect();
    const barBelow = !!selbar && selbar.top > sel.rect.bottom;
    const below = (barBelow ? selbar!.bottom : sel.rect.bottom) + 8;
    const top = below + h < window.innerHeight - 8 ? below : Math.max(8, sel.rect.top - h - 56);
    setPos({ left: Math.min(Math.max(8, (sel.rect.left + sel.rect.right) / 2 - w / 2), window.innerWidth - w - 8), top });
  }, [sel]);
  if (!sel) return null;
  const keep = async (extra: Partial<DeskItem>) => {
    const item = await capture(book, deskId, {
      type: 'quote',
      text: sel.text,
      ar: looksArabic(sel.text),
      source: { bookId: book.id, bookTitle: book.title, location: sel.location, chapterLabel: sel.chapterLabel },
      inInbox: toInbox,
      ...extra,
    });
    window.getSelection()?.removeAllRanges();
    setSel(null);
    return item;
  };
  return (
    <div ref={ref} className="th-selmoves" style={pos ?? { left: -9999, top: -9999 }} onPointerDown={(e) => e.preventDefault()}>
      <PendingRow keep={keep} collect={collect} />
    </div>
  );
}
