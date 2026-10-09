import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookMeta } from '../types';
import { caretAt, offsetWithin, rangeAt } from '../quietReader/textOffsets';
import { hitStroke, pathD } from './geometry';
import { THEME_COLORS, useBookStrokes, useInkUi } from './inkUi';
import { useInkDraw, type InkSurface } from './useInkDraw';

/**
 * Ink over the quiet reader's text. The reader renders each chapter as `.qr-chapter[data-chapter]` inside
 * `.qr-stage`; this layer sits over the stage (it never edits the reader) and ties every stroke to the word it
 * starts on, so a stroke follows its word when the text reflows and grows with the font size.
 */

interface Origin {
  /** The word's top, reading-start corner, relative to the stage. */
  x: number;
  y: number;
  /** The text's font size in pixels: one stroke unit. */
  em: number;
}

/** The top, reading-start corner (right for Arabic) of the word at `offset` in the section, on screen. */
function wordCorner(section: Element, offset: number): { x: number; y: number } | null {
  const range = rangeAt(section, offset, offset + 1);
  if (!range) return null;
  const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 || r.height > 0);
  if (!rect) return null;
  const rtl = getComputedStyle(section).direction !== 'ltr';
  return { x: rtl ? rect.right : rect.left, y: rect.top };
}

function findStage(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.qr .qr-stage');
}

/** The word under a point, or the nearest one on screen, as its section and offset. */
function anchorAt(stage: HTMLElement, x: number, y: number): { section: HTMLElement; offset: number } | null {
  const hit = document.elementsFromPoint(x, y).find((el) => stage.contains(el));
  const word = hit?.closest<HTMLElement>('.ar-word');
  const sectionOf = (el: Element | null | undefined) => el?.closest<HTMLElement>('.qr-chapter') ?? null;
  if (word && sectionOf(word)) return { section: sectionOf(word)!, offset: offsetWithin(sectionOf(word)!, word, 0) };
  // In the margin or between lines: the nearest word on screen.
  const box = stage.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const w of stage.querySelectorAll<HTMLElement>('.qr-chapter .ar-word')) {
    const r = w.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom || r.right < box.left || r.left > box.right || !r.width) continue;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  if (best && sectionOf(best)) return { section: sectionOf(best)!, offset: offsetWithin(sectionOf(best)!, best, 0) };
  // A passage with no Arabic words (Latin text): the text position under the point.
  const caret = caretAt(x, y);
  const section = sectionOf(caret?.node.parentElement);
  return caret && section ? { section, offset: offsetWithin(section, caret.node, caret.offset) } : null;
}

export function CleanInkLayer({ book }: { book: BookMeta }) {
  const ui = useInkUi();
  const all = useBookStrokes(book.id);
  const strokes = useMemo(() => all.filter((s) => s.key.startsWith('clean:')), [all]);
  const [stage, setStage] = useState<HTMLElement | null>(findStage);
  const [frame, setFrame] = useState<DOMRect | null>(null);
  const [origins, setOrigins] = useState<Map<string, Origin>>(new Map());
  const layerRef = useRef<HTMLDivElement>(null);

  // The quiet reader comes and goes (Original layout, PDF pages): look for its stage now and then.
  useEffect(() => {
    const t = window.setInterval(() => setStage((s) => (s && s.isConnected ? s : findStage())), 500);
    return () => window.clearInterval(t);
  }, []);

  const measure = useCallback(() => {
    if (!stage?.isConnected) return;
    const box = stage.getBoundingClientRect();
    setFrame((f) => (f && f.left === box.left && f.top === box.top && f.width === box.width && f.height === box.height ? f : box));
    const text = stage.querySelector('.qr-text');
    const em = text ? parseFloat(getComputedStyle(text).fontSize) || 22 : 22;
    // Paged layout keeps the other pages beside the column, hidden by it: their words' strokes are not shown.
    const column = stage.querySelector('.qr-column')?.getBoundingClientRect();
    const next = new Map<string, Origin>();
    for (const s of strokes) {
      const section = stage.querySelector(`.qr-chapter[data-chapter="${s.key.slice(6)}"]`);
      if (!section || s.offset === undefined) continue;
      const c = wordCorner(section, s.offset);
      if (!c || (column && (c.x < column.left - 2 || c.x > column.right + 2))) continue;
      next.set(s.id, { x: c.x - box.left, y: c.y - box.top, em });
    }
    setOrigins(next);
  }, [stage, strokes]);

  // Measure again whenever the text can have moved: scrolling, turning a page, resizing, re-rendering.
  useEffect(() => {
    if (!stage) return;
    let raf = 0;
    const soon = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    soon();
    document.addEventListener('scroll', soon, true);
    window.addEventListener('resize', soon);
    const ro = new ResizeObserver(soon);
    ro.observe(stage);
    const text = stage.querySelector('.qr-text');
    if (text) ro.observe(text);
    const mo = new MutationObserver(soon);
    mo.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    void document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('scroll', soon, true);
      window.removeEventListener('resize', soon);
      ro.disconnect();
      mo.disconnect();
    };
  }, [stage, measure]);

  const surface: InkSurface = {
    begin(x, y) {
      const layer = layerRef.current;
      if (!stage || !layer || !frame) return null;
      // Look under the layer for the word.
      layer.style.pointerEvents = 'none';
      const at = anchorAt(stage, x, y);
      layer.style.pointerEvents = '';
      if (!at) return null;
      const corner = wordCorner(at.section, at.offset);
      const text = stage.querySelector('.qr-text');
      const em = text ? parseFloat(getComputedStyle(text).fontSize) || 22 : 22;
      if (!corner) return null;
      const ox = corner.x;
      const oy = corner.y;
      return {
        map: (cx, cy) => [(cx - ox) / em, (cy - oy) / em],
        unitsPerPx: 1 / em,
        transform: `translate(${ox - frame.left} ${oy - frame.top}) scale(${em})`,
        base: { bookId: book.id, key: `clean:${at.section.dataset.chapter}`, offset: at.offset },
      };
    },
    hitsAt(x, y) {
      if (!frame) return [];
      return strokes.filter((s) => {
        const o = origins.get(s.id);
        if (!o) return false;
        return hitStroke(s.pts, s.width, (x - frame.left - o.x) / o.em, (y - frame.top - o.y) / o.em, 10 / o.em);
      });
    },
  };
  const draw = useInkDraw(surface, THEME_COLORS);

  if (!stage || !frame || (!ui.inking && !origins.size)) return null;
  return createPortal(
    <div
      ref={layerRef}
      className={'ink-clean' + (ui.inking ? ' ink-clean--on' : '') + (ui.inking && ui.tool === 'eraser' ? ' ink-clean--erase' : '') + (ui.penSeen ? ' ink-clean--pen' : '')}
      style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      aria-hidden={!ui.inking}
      aria-label={ui.inking ? 'Write on the page' : undefined}
      {...draw.handlers}
    >
      <svg width="100%" height="100%">
        {strokes.map((s) => {
          const o = origins.get(s.id);
          return o ? (
            <g key={s.id} transform={`translate(${o.x} ${o.y}) scale(${o.em})`}>
              <path className={'ink-stroke' + (s.tool === 'marker' ? ' ink-stroke--marker' : '')} d={pathD(s.pts)} style={{ stroke: THEME_COLORS[s.color], strokeWidth: s.width }} />
            </g>
          ) : null;
        })}
        <g ref={draw.liveGroupRef}>
          <path ref={draw.liveRef} className="ink-stroke" />
        </g>
      </svg>
    </div>,
    document.body
  );
}
