import { useEffect, useMemo, useRef } from 'react';
import type { BookMeta } from '../types';
import type { OpenedPdf } from '../pdf/pages/pdfjsLoader';
import type { PdfPageContext } from '../pdf/pages/extensions';
import { hitStroke, pathD, r1 } from './geometry';
import { PAPER_COLORS, setInkUi, useBookStrokes, useInkUi } from './inkUi';
import { useInkDraw, type InkSurface } from './useInkDraw';
import { IconPen, IconSketch } from './icons';

/** Page units: a PDF page is this wide at every zoom, so strokes stay where they were written. */
const PAGE_UNITS = 1000;

/**
 * Ink on a PDF page: a pages-view extension layer (src/pdf/pages/extensions.ts) drawn inside each page frame,
 * above the text layer. It only takes the pointer while writing; otherwise taps go through to the text.
 */
export function PdfInkLayer({ book, page, width, height }: PdfPageContext) {
  const ui = useInkUi();
  const all = useBookStrokes(book.id);
  const key = `pdf:${page}`;
  const strokes = useMemo(() => all.filter((s) => s.key === key), [all, key]);
  const svgRef = useRef<SVGSVGElement>(null);

  const surface: InkSurface = {
    begin() {
      const b = svgRef.current?.getBoundingClientRect();
      if (!b?.width) return null;
      const k = PAGE_UNITS / b.width;
      return { map: (x, y) => [(x - b.left) * k, (y - b.top) * k], unitsPerPx: k, base: { bookId: book.id, key } };
    },
    hitsAt(x, y) {
      const b = svgRef.current?.getBoundingClientRect();
      if (!b?.width) return [];
      const k = PAGE_UNITS / b.width;
      const px = (x - b.left) * k;
      const py = (y - b.top) * k;
      return strokes.filter((s) => hitStroke(s.pts, s.width, px, py, 10 * k));
    },
  };
  const draw = useInkDraw(surface, PAPER_COLORS);

  if (!strokes.length && !ui.inking) return null;
  const vh = r1((PAGE_UNITS * height) / Math.max(1, width));
  return (
    <svg
      ref={svgRef}
      className={'ink-page' + (ui.inking ? ' ink-page--on' : '') + (ui.inking && ui.tool === 'eraser' ? ' ink-page--erase' : '') + (ui.penSeen ? ' ink-page--pen' : '')}
      viewBox={`0 0 ${PAGE_UNITS} ${vh}`}
      preserveAspectRatio="none"
      aria-hidden={!ui.inking}
      aria-label={ui.inking ? `Write on page ${page}` : undefined}
      {...draw.handlers}
    >
      {strokes.map((s) => (
        <path key={s.id} className={'ink-stroke' + (s.tool === 'marker' ? ' ink-stroke--marker' : '')} d={pathD(s.pts)} style={{ stroke: PAPER_COLORS[s.color], strokeWidth: s.width }} />
      ))}
      <g ref={draw.liveGroupRef}>
        <path ref={draw.liveRef} className="ink-stroke" />
      </g>
    </svg>
  );
}

/** Write and Sketch in the pages view's top bar; also tells the sketch panel which page is being read. */
export function PdfInkToolbar({ page }: { book: BookMeta; page: number; total: number; opened: OpenedPdf }) {
  const ui = useInkUi();
  useEffect(() => setInkUi({ pdfPage: page }), [page]);
  useEffect(() => () => setInkUi({ pdfPage: null }), []);
  return (
    <>
      <button
        type="button"
        className={'reader__toc-toggle ink-tbtn' + (ui.inking ? ' ink-tbtn--on' : '')}
        aria-pressed={ui.inking}
        onClick={() => setInkUi({ inking: !ui.inking })}
        title="Write on the page (Alt+W)"
      >
        <IconPen /> Write
      </button>
      <button
        type="button"
        className={'reader__toc-toggle ink-tbtn' + (ui.sketch ? ' ink-tbtn--on' : '')}
        aria-pressed={ui.sketch}
        onClick={() => setInkUi({ sketch: !ui.sketch })}
        title="Sketch beside this page (Alt+K)"
      >
        <IconSketch /> Sketch
      </button>
    </>
  );
}
