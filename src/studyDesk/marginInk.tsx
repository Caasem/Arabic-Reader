import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { BookMeta } from '../types';
import { hitStroke, pathD, pressureWidth, r1 } from '../annotate/geometry';
import { inkUi, MARKER_WIDTH, PAPER_COLORS, recordInk, setInkUi, THEME_COLORS } from '../annotate/inkUi';
import type { InkPoint } from '../annotate/types';
import { deleteItem, getItem, updateItem } from './deskStore';
import { attachImage } from './marginImages';
import { capture } from './useDesk';
import type { DeskInk, DeskInkStroke, DeskItem, DeskPin } from './types';

/**
 * Writing straight in a margin (the quiet reader's and the strip beside PDF pages): ink becomes an ink card, a
 * margin note whose face is handwriting. Strokes written close together, without a long pause, join the same
 * card; a stroke started on a card's ink always joins it. Being a desk item, an ink card piles, folds, moves,
 * reaches the document and exports like any card; a picture of its ink (`imageHash`, an SVG) stands in for it
 * where handwriting cannot be drawn live (the document, Word, the folded chip).
 *
 * The pen (a stylus) always writes in a margin; a mouse or finger only while Write (Alt+W) is on, so their
 * usual margin gestures (double-tap to write, drag, lasso) keep working otherwise.
 */

/** A pause longer than this, or a stroke started away from the card, starts a new card. */
const JOIN_MS = 2500;
const JOIN_PX = 36;
/** Room around the ink inside its box. */
const PAD = 8;

/** Where a new card would go: its column on screen, and its place (line or page height) for a screen y. */
export interface InkColumn {
  side: DeskPin['side'];
  /** The card's left edge and width on screen (as given to Gloss). */
  left: number;
  width: number;
  place(y: number): string | null;
}

const inner = (width: number) => Math.max(60, width - 22); // the card's padding, 12 + 10

/** The ink as an SVG picture on paper, for the document, exports and the folded chip. */
export function inkSvg(ink: DeskInk): string {
  const paths = ink.strokes
    .map((s) => `<path d="${pathD(s.pts)}" fill="none" stroke="${PAPER_COLORS[s.color]}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"${s.marker ? ' stroke-opacity="0.35"' : ''}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ink.w} ${ink.h}" width="${ink.w}" height="${ink.h}"><rect width="${ink.w}" height="${ink.h}" fill="#fffdf8"/>${paths}</svg>`;
}
export const inkBlob = (ink: DeskInk): Blob => new Blob([inkSvg(ink)], { type: 'image/svg+xml' });

/**
 * Adds a stroke (in the card's units) to the ink, growing the box to hold it. A stroke above or left of the box
 * moves everything down or right instead, so nothing is ever cut off.
 */
export function addInk(ink: DeskInk | undefined, stroke: DeskInkStroke, width: number): DeskInk {
  const strokes = [...(ink?.strokes ?? []), stroke];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.pts) {
      x0 = Math.min(x0, p[0] - s.width / 2);
      y0 = Math.min(y0, p[1] - s.width / 2);
      x1 = Math.max(x1, p[0] + s.width / 2);
      y1 = Math.max(y1, p[1] + s.width / 2);
    }
  const dx = x0 < PAD ? PAD - x0 : 0;
  const dy = y0 < PAD ? PAD - y0 : 0;
  const moved = dx || dy ? strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y, p]) => [r1(x + dx), r1(y + dy), p] as InkPoint) })) : strokes;
  return { w: Math.max(ink?.w ?? width, r1(x1 + dx + PAD)), h: Math.max(ink?.h ?? 0, r1(y1 + dy + PAD)), strokes: moved };
}

/** The ink without the strokes the eraser touches at (x, y) in the card's units, or null when none is touched. */
export function eraseInk(ink: DeskInk, x: number, y: number, radius: number): DeskInk | null {
  const kept = ink.strokes.filter((s) => !hitStroke(s.pts, s.width, x, y, radius));
  return kept.length === ink.strokes.length ? null : { ...ink, strokes: kept };
}

async function saveInk(item: Pick<DeskItem, 'id' | 'imageHash' | 'type'>, ink: DeskInk): Promise<void> {
  await updateItem(item.id, { ink });
  await attachImage(item as DeskItem, inkBlob(ink));
}

/** A card's ink, drawn live in the theme's ink colours; the eraser works on it while Write is on. */
export function InkView({ item }: { item: DeskItem }) {
  const ink = item.ink!;
  const svgRef = useRef<SVGSVGElement>(null);
  const erasing = useRef<{ id: number; before: DeskInk; now: DeskInk } | null>(null);
  const eraseAt = (e: { clientX: number; clientY: number }) => {
    const a = erasing.current;
    const r = svgRef.current?.getBoundingClientRect();
    if (!a || !r?.width) return;
    const k = ink.w / r.width;
    const next = eraseInk(a.now, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 8 * k);
    if (next) {
      a.now = next;
      void updateItem(item.id, { ink: next });
    }
  };
  return (
    <svg
      ref={svgRef}
      className={'sd-mink' + (inkUi().inking && inkUi().tool === 'eraser' ? ' sd-mink--erase' : '')}
      data-ink={item.id}
      viewBox={`0 0 ${ink.w} ${ink.h}`}
      role="img"
      aria-label="Handwriting"
      onPointerDown={(e) => {
        const ui = inkUi();
        if (!ui.inking || ui.tool !== 'eraser') return;
        e.preventDefault();
        e.stopPropagation();
        erasing.current = { id: e.pointerId, before: ink, now: ink };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        eraseAt(e);
      }}
      onPointerMove={(e) => erasing.current?.id === e.pointerId && eraseAt(e)}
      onPointerUp={() => {
        const a = erasing.current;
        erasing.current = null;
        if (!a || a.now === a.before) return;
        const { before, now } = a;
        const apply = async (ink: DeskInk) => {
          if (!ink.strokes.length && !item.body?.trim()) await deleteItem(item.id);
          else await saveInk(item, ink);
        };
        void apply(now);
        recordInk({ undo: () => saveInk(item, before), redo: () => apply(now) });
      }}
    >
      {ink.strokes.map((s, i) => (
        <path key={i} d={pathD(s.pts)} className={'sd-mink__s' + (s.marker ? ' sd-mink__s--marker' : '')} style={{ stroke: THEME_COLORS[s.color], strokeWidth: s.width }} />
      ))}
    </svg>
  );
}

interface Live {
  id: number;
  column: InkColumn;
  pts: [number, number, number][];
  pen: boolean;
  marker: boolean;
  width: number;
}

/**
 * Pointer handling for writing in a margin. Returns `onPointerDownCapture` for the margin layer (it takes the
 * pointer before the layer's own gestures when it should write) and the live stroke's overlay.
 */
export function useMarginInk(book: BookMeta, deskId: string, columnAt: (x: number) => InkColumn | null) {
  const liveRef = useRef<SVGPathElement>(null);
  const live = useRef<Live | null>(null);
  /** The card written in last, and when, so the next strokes can join it. */
  const last = useRef<{ id: string; at: number } | null>(null);
  const columnRef = useRef(columnAt);
  columnRef.current = columnAt;

  const finish = useCallback(async (l: Live) => {
    liveRef.current?.setAttribute('d', '');
    // A tap with the pen is not writing.
    if (l.pts.length < 2) return;
    const { color } = inkUi();
    const width = l.marker ? l.width : pressureWidth(l.width, l.pts as InkPoint[], l.pen);
    const [sx, sy] = l.pts[0];
    // The card this stroke joins: one whose ink it starts on, or the one written in just now, if close.
    const near = (el: Element, pad: number) => {
      const r = el.getBoundingClientRect();
      return sx >= r.left - pad && sx <= r.right + pad && sy >= r.top - pad && sy <= r.bottom + pad;
    };
    let target: Element | null = Array.from(document.querySelectorAll('.sd-mink[data-ink]')).find((el) => near(el, 4)) ?? null;
    if (!target && last.current && Date.now() - last.current.at < JOIN_MS) {
      const el = document.querySelector(`.sd-mink[data-ink="${last.current.id}"]`);
      if (el && near(el, JOIN_PX)) target = el;
    }
    if (target) {
      const id = (target as HTMLElement).dataset.ink ?? target.getAttribute('data-ink')!;
      const item = await getItem(id);
      if (!item?.ink) return;
      const r = target.getBoundingClientRect();
      const k = item.ink.w / Math.max(1, r.width);
      const stroke: DeskInkStroke = { color, width: r1(width * k), pts: l.pts.map(([x, y, p]) => [r1((x - r.left) * k), r1((y - r.top) * k), p]), ...(l.marker ? { marker: true } : {}) };
      const before = item.ink;
      const after = addInk(before, stroke, before.w);
      await saveInk(item, after);
      last.current = { id, at: Date.now() };
      recordInk({ undo: () => saveInk(item, before), redo: () => saveInk(item, after) });
      return;
    }
    // A new card, level with where the writing starts.
    const location = l.column.place(sy);
    if (!location) return;
    const w = inner(l.column.width);
    const ox = l.column.left + 12;
    const oy = Math.min(...l.pts.map((p) => p[1])) - PAD;
    const stroke: DeskInkStroke = { color, width: r1(width), pts: l.pts.map(([x, y, p]) => [r1(x - ox), r1(y - oy), p]), ...(l.marker ? { marker: true } : {}) };
    const ink = addInk(undefined, stroke, w);
    const item = await capture(book, deskId, { type: 'line', text: '', body: '', fromMargin: true, inInbox: false, pin: { bookId: book.id, location, side: l.column.side }, ink }, inkBlob(ink));
    last.current = { id: item.id, at: Date.now() };
    let gone = item;
    recordInk({
      undo: () => deleteItem(gone.id),
      redo: async () => {
        gone = await capture(book, deskId, { type: 'line', text: '', body: '', fromMargin: true, inInbox: false, pin: item.pin, ink }, inkBlob(ink));
      },
    });
  }, [book, deskId]);

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const ui = inkUi();
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.pointerType === 'pen' && !ui.penSeen) setInkUi({ penSeen: true });
      // The pen always writes here; a mouse or finger only while Write is on (and fingers not once a pen is seen).
      const writes = e.pointerType === 'pen' ? ui.tool !== 'eraser' || !ui.inking : ui.inking && ui.tool !== 'eraser' && !(e.pointerType === 'touch' && ui.penSeen);
      if (!writes) return;
      const t = e.target as Element;
      // On a card: only on its ink, never its text, buttons or picture.
      if (t.closest('[data-gloss]') && !t.closest('.sd-mink')) return;
      if (!t.closest('.sd-margins__area, .sd-mink')) return;
      const column = columnRef.current(e.clientX);
      if (!column) return;
      e.preventDefault();
      e.stopPropagation();
      const marker = ui.inking && ui.tool === 'marker';
      live.current = { id: e.pointerId, column, pts: [[e.clientX, e.clientY, e.pressure || 0.5]], pen: e.pointerType === 'pen', marker, width: marker ? MARKER_WIDTH : ui.width };
      const path = liveRef.current;
      if (path) {
        path.setAttribute('d', pathD(live.current.pts));
        path.setAttribute('class', 'sd-mink-live__s' + (marker ? ' sd-mink__s--marker' : ''));
        path.style.stroke = THEME_COLORS[ui.color];
        path.style.strokeWidth = String(live.current.width);
      }
      const move = (ev: PointerEvent) => {
        const l = live.current;
        if (!l || ev.pointerId !== l.id) return;
        const evs = ev.getCoalescedEvents?.() ?? [];
        for (const c of evs.length ? evs : [ev]) {
          const p = l.pts[l.pts.length - 1];
          if (Math.hypot(c.clientX - p[0], c.clientY - p[1]) >= 1.5) l.pts.push([c.clientX, c.clientY, Math.round((c.pressure || 0.5) * 100) / 100]);
        }
        liveRef.current?.setAttribute('d', pathD(l.pts));
      };
      const up = (ev: PointerEvent) => {
        const l = live.current;
        if (!l || ev.pointerId !== l.id) return;
        live.current = null;
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        void finish(l);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', up, true);
    },
    [finish]
  );

  // Clear a stroke left half-drawn if the margin goes away mid-stroke.
  useEffect(() => () => void (live.current = null), []);

  const overlay = (
    <svg className="sd-mink-live" aria-hidden="true">
      <path ref={liveRef} />
    </svg>
  );
  return { onPointerDownCapture, overlay };
}
