import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { carriesFiles, imageIn } from './marginImages';
import { Gloss, MarginSettings } from './MarginLayer';
import { pdfLevelAt } from './pageGeometry';
import { pdfMarks, setPdfDeskHover, stackTops, usePdfDesk, type PdfMark } from './pdfDesk';
import { capture, type DeskData } from './useDesk';
import './pdfDesk.css';

/**
 * The margin beside the PDF pages view. A strip is kept free to the right of the pages (body class
 * `sd-pdf-margin`, pdfDesk.css) and the pages fit the rest, so no card covers a page. In it: a card per
 * captured region (the boxes PdfDeskLayer draws), level with its box, and margin notes. Double-tap the strip
 * to write a note tied to that height of the page; drop an image file on it for a screenshot note. Notes are
 * the same cards as in the quiet reader's margins (Gloss). Works from the pages view's DOM only
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
  onToast(m: string): void;
  onOpenDocument(itemId?: string): void;
}

export function PdfMargin({ book, data, onToast, onOpenDocument }: Props) {
  const { prefs, updatePrefs } = usePreferences();
  const { hover } = usePdfDesk();
  const [stage, tick] = useStageGeometry();
  const [wide, setWide] = useState(() => window.innerWidth >= MIN_WINDOW);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
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

  const marks = useMemo(() => pdfMarks(data.items, book.id), [data.items, book.id]);
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

  // Stack the cards beside their places and draw the lines (after render, once heights are known).
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const svg = svgRef.current;
    if (!layer || !svg || !stage) return;
    const cards = placed.map((p) => layer.querySelector<HTMLElement>(`[data-gloss="${p.mark.item.id}"]`));
    const tops = stackTops(
      placed.map((p) => Math.max(p.sy - 16, stage.top + 30)),
      cards.map((c) => c?.offsetHeight ?? 0),
      10
    );
    const gx = stage.right + GAP;
    const paths: string[] = [];
    placed.forEach((p, i) => {
      const card = cards[i];
      if (!card) return;
      card.style.top = `${tops[i]}px`;
      const gy = tops[i] + 16;
      const mx = (p.sx + gx) / 2;
      const id = p.mark.item.id;
      const cls = (id === hover || id === focusId ? 'on' : '') + (p.mark.h > 0 ? '' : ' free');
      paths.push(`<g class="${cls}"><path d="M${p.sx} ${p.sy} C${mx} ${p.sy} ${mx} ${gy} ${gx} ${gy}"/><circle cx="${p.sx}" cy="${p.sy}" r="2.4"/></g>`);
    });
    svg.innerHTML = paths.join('');
  });

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
    <div ref={layerRef} className="sd-pdfmargin" aria-label="Margin beside the pages">
      <svg ref={svgRef} className="sd-pdfdesk__lines" aria-hidden="true" />
      <div
        className={'sd-margins__area sd-pdfmargin__area' + (dropping ? ' sd-margins__area--drop' : '')}
        style={{ left: stage.right, width: PDF_STRIP, top: stage.top, height: stage.height }}
        onPointerUp={(e) => {
          if (e.target !== e.currentTarget) return;
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
      {placed.map((p) => (
        <Gloss
          key={p.mark.item.id}
          item={p.mark.item}
          side="right"
          left={left}
          width={width}
          book={book}
          docMode={prefs.studyDeskMarginsInDocument}
          toInbox={prefs.studyDeskMarginsToInbox}
          autoFocus={p.mark.item.id === focusId}
          canTie={false}
          onFocused={(f) => setFocusId(f ? p.mark.item.id : null)}
          onHover={(h) => setPdfDeskHover(h ? p.mark.item.id : null)}
          onToast={onToast}
          onOpenDocument={onOpenDocument}
        />
      ))}
      <button type="button" className="sd-margins__set" style={{ left: stage.right + PDF_STRIP - 130, top: stage.top + 4 }} onClick={() => setSettingsOpen((v) => !v)}>
        Margin settings
      </button>
      {settingsOpen && <MarginSettings prefs={prefs} update={updatePrefs} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
