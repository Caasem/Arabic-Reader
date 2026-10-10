import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { carriesFiles, imageIn } from './marginImages';
import { Gloss, isFolded, MarginSettings } from './MarginLayer';
import { PileFan } from './PileFan';
import { fromOtherBooks, groupOf, groupPiles, isBeneath } from './piles';
import { usePileGestures } from './usePileGestures';
import { foldActions, foldKeys } from './folding';
import { useMarginInk } from './marginInk';
import { MarginRing, marginActions, useRingTrigger, type DeskCommands, type RingState } from './MarginRing';
import { pdfLevelAt } from './pageGeometry';
import { pdfMarks, setPdfDeskFocus, setPdfDeskHover, setPdfDeskTie, usePdfDesk, type PdfMark } from './pdfDesk';
import { capture, type DeskData } from './useDesk';
import './pdfDesk.css';

/**
 * The margin beside the PDF pages view. A strip is kept free to the right of the pages (body class
 * `sd-pdf-margin`, pdfDesk.css) and the pages fit the rest, so no card covers a page. In it: a card per
 * captured region (the boxes PdfDeskLayer draws), level with its box, and margin notes. Double-tap the strip
 * to write a note tied to that height of the page; drop an image file on it for a screenshot note. Notes are
 * the same cards as in the quiet reader's margins (Gloss), and they pile the same way (usePileGestures.ts): rest a
 * dragged card on another to pile it, drop sooner to move it to that height. Works from the pages view's DOM only
 * (`.pdfp__stage`, `.pdfp-page[data-page]`).
 */

export const PDF_STRIP = 300;
const GAP = 14;
/** Narrower windows keep the whole width for the page; the boxes still show. */
const MIN_WINDOW = 900;

function useStageGeometry(): [DOMRect | null, number] {
  const [stage, setStage] = useState<DOMRect | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let observed: Element | null = null;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('.pdfp__stage');
        setStage(el ? el.getBoundingClientRect() : null);
        setTick((t) => t + 1);
      });
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const attach = () => {
      const el = document.querySelector('.pdfp__stage');
      if (el !== observed) {
        ro?.disconnect();
        if (el) ro?.observe(el);
        observed = el;
        measure();
      }
    };
    attach();
    const poll = window.setInterval(attach, 800);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, []);
  return [stage, tick];
}

interface Placed {
  mark: PdfMark;
  /** On screen: the box's right edge (regions) or the page's right edge (notes), and the line's height. */
  sx: number;
  sy: number;
}

interface Props {
  book: BookMeta;
  data: DeskData;
  /** With `undo`, the message offers Undo (piles made, cards taken off one, cards deleted). */
  onToast(m: string, undo?: () => Promise<void>): void;
  onOpenDocument(itemId?: string): void;
  /** For the right-click ring (MarginRing.tsx). */
  commands: DeskCommands;
}

export function PdfMargin({ book, data, onToast, onOpenDocument, commands }: Props) {
  const { prefs, updatePrefs } = usePreferences();
  const { hover, focus } = usePdfDesk();
  const [stage, tick] = useStageGeometry();
  const [wide, setWide] = useState(() => window.innerWidth >= MIN_WINDOW);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  // Right-click (or long-press) the strip: the ring of shortcuts.
  const [ring, setRing] = useState<RingState | null>(null);
  const stripRing = useRingTrigger((x, y) => setRing({ x, y, title: 'Margin', actions: marginActions(commands, () => void newNote(y), () => setSettingsOpen(true), foldActions(onScreen, (i) => isFolded(i, prefs.studyDeskCards))) }));
  const layerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= MIN_WINDOW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const on = !!stage && wide && prefs.studyDeskMargins !== 'off';

  // Keep the strip free beside the pages.
  useEffect(() => {
    if (!on) return;
    document.body.classList.add('sd-pdf-margin');
    return () => document.body.classList.remove('sd-pdf-margin');
  }, [on]);

  // Piles (piles.ts): only a pile's top card is placed; the rest show in its fan.
  const piles = useMemo(() => groupPiles(data.items), [data.items]);
  const marks = useMemo(() => pdfMarks(data.items, book.id).filter((m) => !isBeneath(m.item, piles)), [data.items, book.id, piles]);
  const placed = useMemo<Placed[]>(() => {
    if (!on || !stage) return [];
    const out: Placed[] = [];
    for (const mark of marks) {
      const frame = document.querySelector<HTMLElement>(`.pdfp-page[data-page="${mark.page}"]`);
      if (!frame) continue;
      const r = frame.getBoundingClientRect();
      const top = r.top + mark.y * r.height;
      const bottom = top + mark.h * r.height;
      if (bottom < stage.top || top > stage.bottom) continue;
      const region = mark.h > 0;
      out.push({ mark, sx: region ? r.left + (mark.x + mark.w) * r.width : r.right, sy: region ? top + Math.min(mark.h * r.height, 24) / 2 : top });
    }
    return out;
    // tick: the pages moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, stage, marks, tick]);

  // Writing straight in the strip: ink cards (marginInk.tsx).
  const ink = useMarginInk(book, data.deskId, (x) =>
    stage && x >= stage.right - 4 && x <= stage.right + PDF_STRIP ? { side: 'right', left: stage.right + GAP, width: PDF_STRIP - GAP * 2, place: (y) => pdfLevelAt(y) } : null
  );

  // Folding every card on screen: the cards placed, and the cards of their piles.
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const onScreen = useCallback(() => placedRef.current.flatMap((p) => groupOf(p.mark.item, piles)), [piles]);
  useEffect(() => (on ? foldKeys(onScreen) : undefined), [on, onScreen]);

  // --- piles, shared with the quiet reader's margins: one margin (right), drops land at a height of a page ---
  const { fan, fanGroup, naming, setNaming, sel, lassoBox, lassoed, hoverPile, enterFan, leaveFan, closeFan, pinFan, namePile, deleteCards, onLayerPointerDown, startLasso } = usePileGestures({
    bookId: book.id,
    items: data.items,
    desks: data.desks,
    piles,
    onToast,
    layerRef,
    cards: '.sd-pdfmargin > [data-gloss]',
    placeOf: (top) => {
      if (!placed.some((p) => p.mark.item.id === top.id)) return null;
      const location = top.pin?.bookId === book.id ? top.pin.location : top.source?.location;
      return location ? { bookId: book.id, location, side: 'right' } : null;
    },
    sideAt: (x) => (stage && x >= stage.right - 4 && x <= stage.right + PDF_STRIP ? 'right' : null),
    placeAt: (y) => pdfLevelAt(y),
  });

  // Stack the cards beside their places and draw the lines (after render, once heights are known).
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const svg = svgRef.current;
    if (!layer || !svg || !stage) return;
    const gx = stage.right + GAP;
    const paths: string[] = [];
    let bottom = stage.top + 30;
    placed.forEach((p) => {
      const card = layer.querySelector<HTMLElement>(`.sd-pdfmargin > [data-gloss="${p.mark.item.id}"]`);
      if (!card) return;
      // Room above a pile's colour tab and below its stacked edges, as in the quiet reader's margins.
      const tabbed = card.classList.contains('sd-gloss--tabbed') ? 22 : 0;
      const chip = card.classList.contains('sd-gloss--chip');
      const top = Math.max(p.sy - (chip ? 13 : 16), bottom + tabbed);
      card.style.top = `${top}px`;
      bottom = top + card.offsetHeight + 10 + (card.classList.contains('sd-gloss--pile') ? 10 : 0);
      const gy = top + (chip ? 13 : 16);
      const mx = (p.sx + gx) / 2;
      const id = p.mark.item.id;
      const cls = (id === hover || id === focusId ? 'on' : '') + (p.mark.h > 0 ? '' : ' free') + (chip ? ' folded' : '');
      paths.push(`<g class="${cls}"><path d="M${p.sx} ${p.sy} C${mx} ${p.sy} ${mx} ${gy} ${gx} ${gy}"/><circle cx="${p.sx}" cy="${p.sy}" r="2.4"/></g>`);
    });
    svg.innerHTML = paths.join('');
    // The fan opens where its pile is, moved up as far as needed to stay on screen (scrolling inside if taller).
    const fanEl = layer.querySelector<HTMLElement>('.sd-fan');
    if (fanEl && fanGroup) {
      const anchor = layer.querySelector<HTMLElement>(`.sd-pdfmargin > [data-gloss="${fanGroup[0].id}"]`);
      fanEl.style.maxHeight = `${window.innerHeight - 24}px`;
      const want = (anchor ? parseFloat(anchor.style.top) : stage.top) - 40;
      fanEl.style.top = `${Math.max(12, Math.min(want, window.innerHeight - 12 - fanEl.offsetHeight))}px`;
    }
  });

  // The card of the box (or card) pointed at is lit.
  useEffect(() => {
    layerRef.current?.querySelectorAll('.sd-gloss--lit').forEach((el) => el.classList.remove('sd-gloss--lit'));
    if (hover) layerRef.current?.querySelector(`[data-gloss="${hover}"]`)?.classList.add('sd-gloss--lit');
  });

  // A gloss started from the page (PdfSelect): focused once its card shows, then forgotten.
  useEffect(() => {
    if (focus && placed.some((p) => p.mark.item.id === focus)) {
      setFocusId(focus);
      setPdfDeskFocus(null);
    }
  }, [focus, placed]);

  // --- double-tap the strip to write; drop an image on it ---
  const lastTap = useRef<{ t: number; y: number } | null>(null);
  const newNote = useCallback(
    async (y: number, image?: File) => {
      const location = pdfLevelAt(y);
      if (!location) return onToast(image ? 'Drop beside a page' : 'Tap beside a page');
      const item = await capture(book, data.deskId, { type: image ? 'capture' : 'line', text: '', body: '', fromMargin: true, inInbox: false, pin: { bookId: book.id, location, side: 'right' } }, image);
      if (image) onToast('Image placed in the margin');
      else setFocusId(item.id);
    },
    [book, data.deskId, onToast]
  );

  if (!on || !stage) return null;
  const left = stage.right + GAP;
  const width = PDF_STRIP - GAP * 2;

  return (
    <div ref={layerRef} className="sd-pdfmargin" aria-label="Margin beside the pages" onPointerDown={onLayerPointerDown} onPointerDownCapture={ink.onPointerDownCapture}>
      <svg ref={svgRef} className="sd-pdfdesk__lines" aria-hidden="true" />
      {ink.overlay}
      <div
        className={'sd-margins__area sd-pdfmargin__area' + (dropping ? ' sd-margins__area--drop' : '')}
        style={{ left: stage.right, width: PDF_STRIP, top: stage.top, height: stage.height }}
        onContextMenu={(e) => e.target === e.currentTarget && stripRing.onContextMenu(e)}
        onPointerDown={(e) => {
          stripRing.onPointerDown(e);
          startLasso(e);
        }}
        onPointerMove={stripRing.onPointerMove}
        onPointerUp={(e) => {
          stripRing.onPointerUp();
          if (e.target !== e.currentTarget) return;
          if (lassoed.current) {
            lassoed.current = false;
            lastTap.current = null;
            return;
          }
          const now = Date.now();
          const last = lastTap.current;
          if (last && now - last.t < 420 && Math.abs(last.y - e.clientY) < 24) {
            lastTap.current = null;
            void newNote(e.clientY);
          } else lastTap.current = { t: now, y: e.clientY };
        }}
        onDoubleClick={(e) => e.preventDefault()}
        onDragOver={(e) => {
          if (!carriesFiles(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={(e) => e.target === e.currentTarget && setDropping(false)}
        onDrop={(e) => {
          if (!carriesFiles(e.dataTransfer)) return;
          e.preventDefault();
          setDropping(false);
          const image = imageIn(e.dataTransfer);
          if (!image) return onToast('Only images can be dropped in a margin');
          void newNote(e.clientY, image);
        }}
      >
        <span className="sd-margins__hint">{dropping ? 'Drop the image here' : 'Double-tap to write'}</span>
      </div>
      {placed.map((p) => {
        const group = groupOf(p.mark.item, piles);
        const pileId = group.length > 1 ? p.mark.item.pile!.id : null;
        return (
          <Gloss
            key={p.mark.item.id}
            item={p.mark.item}
            side="right"
            left={left}
            width={width}
            book={book}
            docMode={prefs.studyDeskMarginsInDocument}
            toInbox={prefs.studyDeskMarginsToInbox}
            autoFocus={p.mark.item.id === focusId || p.mark.item.id === focus}
            canTie={!!p.mark.item.fromMargin}
            onTie={() => {
              setPdfDeskTie(p.mark.item.id);
              onToast('Drag over the words on the page this note belongs to');
            }}
            onFocused={(f) => setFocusId(f ? p.mark.item.id : null)}
            onHover={(h) => {
              setPdfDeskHover(h ? p.mark.item.id : null);
              if (pileId) hoverPile(pileId, h);
            }}
            onToast={onToast}
            onOpenDocument={onOpenDocument}
            onRing={setRing}
            selected={sel.has(p.mark.item.id)}
            showSource={!!pileId}
            pile={
              pileId
                ? { count: group.length, name: p.mark.item.pile?.name, color: p.mark.item.pile?.color, others: fromOtherBooks(group, book.id), onOpen: () => pinFan(pileId) }
                : undefined
            }
            fanned={!!pileId && fan?.id === pileId}
          />
        );
      })}
      {fan && fanGroup && placed.some((p) => p.mark.item.id === fanGroup[0].id) && (
        <PileFan
          key={fan.id}
          pileId={fan.id}
          group={fanGroup}
          left={left - 8}
          width={width + 16}
          pinned={fan.pinned}
          naming={naming === fan.id}
          onEnter={enterFan}
          onLeave={leaveFan}
          onClose={closeFan}
          onStartNaming={() => (pinFan(fan.id), setNaming(fan.id))}
          onCancelNaming={() => setNaming(null)}
          onName={(name, color) => void namePile(fanGroup, name, color)}
          renderCard={(m) => (
            <Gloss
              key={m.id}
              item={m}
              side="right"
              left={0}
              width={0}
              inline
              showSource
              book={book}
              docMode={prefs.studyDeskMarginsInDocument}
              toInbox={prefs.studyDeskMarginsToInbox}
              autoFocus={false}
              onFocused={() => {}}
              onHover={(h) => setPdfDeskHover(h ? m.id : null)}
              onToast={onToast}
              onOpenDocument={onOpenDocument}
              onRing={setRing}
              onRemove={() => void deleteCards([m])}
            />
          )}
        />
      )}
      {lassoBox && <div className="sd-lasso" style={lassoBox} aria-hidden="true" />}
      {sel.size > 0 && (
        <div className="sd-selbar" role="status" style={{ top: stage.top + 6, left: stage.right + PDF_STRIP / 2 }}>
          {sel.size > 1 ? (
            <>
              {sel.size} chosen · <kbd>P</kbd> piles them · <kbd>Del</kbd> deletes · <kbd>Esc</kbd> lets go
            </>
          ) : (
            <>1 chosen · Shift-click or drag over the margin to add more</>
          )}
        </div>
      )}
      <button type="button" className="sd-margins__set" style={{ left: stage.right + PDF_STRIP - 130, top: stage.top + 4 }} onClick={() => setSettingsOpen((v) => !v)}>
        Margin settings
      </button>
      {settingsOpen && <MarginSettings prefs={prefs} update={updatePrefs} onClose={() => setSettingsOpen(false)} />}
      {ring && <MarginRing {...ring} onClose={() => setRing(null)} />}
    </div>
  );
}
