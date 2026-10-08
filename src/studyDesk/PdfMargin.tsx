import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { updateItem } from './deskStore';
import { pdfMarks, setPdfDeskHover, stackTops, usePdfDesk, type PdfMark } from './pdfDesk';
import { TYPE_LABEL } from './useDesk';
import './pdfDesk.css';

/**
 * The margin beside the PDF pages view: one card per desk region (the boxes PdfDeskLayer draws), level with
 * its box and joined to it by a thin line. While the book has regions, a strip is kept free to the right of
 * the pages (body class `sd-pdf-margin`, pdfDesk.css) and the pages fit the narrower space, so no card ever
 * covers a page. Works from the pages view's DOM only (`.pdfp__stage`, `.pdfp-page[data-page]`).
 */

const STRIP = 300;
const GAP = 14;
/** Narrower windows keep the whole width for the page; the boxes still show. */
const MIN_WINDOW = 900;

interface Geo {
  stage: DOMRect;
}

function useStageGeometry(): [Geo | null, number] {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let observed: Element | null = null;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const stage = document.querySelector<HTMLElement>('.pdfp__stage');
        setGeo(stage ? { stage: stage.getBoundingClientRect() } : null);
        setTick((t) => t + 1);
      });
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const attach = () => {
      const stage = document.querySelector('.pdfp__stage');
      if (stage !== observed) {
        ro?.disconnect();
        if (stage) ro?.observe(stage);
        observed = stage;
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
  return [geo, tick];
}

interface Placed {
  mark: PdfMark;
  /** The box on screen. */
  box: DOMRect;
}

export function PdfMargin({ book, onOpenDocument }: { book: BookMeta; onOpenDocument(itemId?: string): void }) {
  const { prefs } = usePreferences();
  const { items, hover } = usePdfDesk();
  const [geo, tick] = useStageGeometry();
  const [wide, setWide] = useState(() => window.innerWidth >= MIN_WINDOW);
  const layerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= MIN_WINDOW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const marks = useMemo(() => pdfMarks(items, book.id), [items, book.id]);
  const on = !!geo && wide && prefs.studyDeskMargins !== 'off' && marks.length > 0;

  // Keep the strip free beside the pages while there is something to show in it.
  useEffect(() => {
    if (!on) return;
    document.body.classList.add('sd-pdf-margin');
    return () => document.body.classList.remove('sd-pdf-margin');
  }, [on]);

  const placed = useMemo<Placed[]>(() => {
    if (!on || !geo) return [];
    const out: Placed[] = [];
    for (const mark of marks) {
      const frame = document.querySelector<HTMLElement>(`.pdfp-page[data-page="${mark.page}"]`);
      if (!frame) continue;
      const r = frame.getBoundingClientRect();
      const box = new DOMRect(r.left + mark.x * r.width, r.top + mark.y * r.height, mark.w * r.width, mark.h * r.height);
      if (box.bottom < geo.stage.top - 200 || box.top > geo.stage.bottom + 200) continue;
      out.push({ mark, box });
    }
    return out;
    // tick: the pages moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, geo, marks, tick]);

  // Stack the cards beside their boxes and draw the lines (after render, once heights are known).
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const svg = svgRef.current;
    if (!layer || !svg || !geo) return;
    const cards = placed.map((p) => layer.querySelector<HTMLElement>(`[data-gloss="${p.mark.item.id}"]`));
    const tops = stackTops(
      placed.map((p) => p.box.top - geo.stage.top - 6),
      cards.map((c) => c?.offsetHeight ?? 0)
    );
    const paths: string[] = [];
    const gx = geo.stage.width + GAP;
    placed.forEach((p, i) => {
      const card = cards[i];
      if (!card) return;
      card.style.top = `${tops[i]}px`;
      const sx = p.box.right - geo.stage.left;
      const sy = p.box.top - geo.stage.top + Math.min(p.box.height, 24) / 2;
      const gy = tops[i] + 16;
      const mx = (sx + gx) / 2;
      const cls = p.mark.item.id === hover ? 'on' : '';
      paths.push(`<g class="${cls}"><path d="M${sx} ${sy} C${mx} ${sy} ${mx} ${gy} ${gx} ${gy}"/><circle cx="${sx}" cy="${sy}" r="2.4"/></g>`);
    });
    svg.innerHTML = paths.join('');
  });

  if (!on || !geo) return null;

  return (
    <div
      ref={layerRef}
      className="sd-pdfmargin"
      style={{ left: geo.stage.left, top: geo.stage.top, width: geo.stage.width + STRIP, height: geo.stage.height }}
      aria-label="Margin beside the pages"
    >
      <svg ref={svgRef} className="sd-pdfdesk__lines" aria-hidden="true" />
      {placed.map((p) => (
        <Card key={p.mark.item.id} mark={p.mark} left={geo.stage.width + GAP} width={STRIP - GAP * 2} on={hover === p.mark.item.id} onShow={() => onOpenDocument(p.mark.item.id)} />
      ))}
    </div>
  );
}

function Card({ mark, left, width, on, onShow }: { mark: PdfMark; left: number; width: number; on: boolean; onShow(): void }) {
  const { item } = mark;
  const [body, setBody] = useState(item.body ?? '');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused) setBody(item.body ?? '');
  }, [item.body, focused]);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [body]);
  // Region captures without words are titled "Region of page N"; the label already says the page.
  const text = /^Region of page \d+$/.test(item.text) ? '' : item.text;
  return (
    <div
      className={'sd-pdfcard' + (on || focused ? ' sd-pdfcard--on' : '')}
      data-gloss={item.id}
      style={{ left, width }}
      onMouseEnter={() => setPdfDeskHover(item.id)}
      onMouseLeave={() => !focused && setPdfDeskHover(null)}
    >
      <div className="sd-gloss__k">
        {TYPE_LABEL[item.type]}
        <span>Page {mark.page}</span>
      </div>
      {text && (
        <div className={'sd-gloss__q' + (item.ar ? ' sd-gloss__q--ar' : '')} dir="auto">
          {text}
        </div>
      )}
      <textarea
        ref={ref}
        className="sd-gloss__body"
        dir="auto"
        rows={1}
        value={body}
        placeholder="Write a gloss…"
        aria-label="Gloss"
        onFocus={() => (setFocused(true), setPdfDeskHover(item.id))}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => {
          setFocused(false);
          setPdfDeskHover(null);
          if (body !== (item.body ?? '')) void updateItem(item.id, { body });
        }}
        onKeyDown={(e) => {
          // Typing stays in the card (the pages view turns pages on arrow keys); Alt chords still reach the app.
          if (!e.altKey) e.stopPropagation();
          if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
        }}
      />
      <div className="sd-pdfcard__tools">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (body !== (item.body ?? '')) void updateItem(item.id, { body });
            onShow();
          }}
        >
          Show in document
        </button>
      </div>
    </div>
  );
}
