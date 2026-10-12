import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatCleanLocation } from '../../readerCore/location';
import { loadCleanPosition } from '../../readerCore/cleanPosition';
import { offsetWithin, rangeAt } from '../../quietReader/textOffsets';
import { loadPdfPage } from '../../pdf/pages/pdfView';
import type { OpenedPdf, PDFPageProxy } from '../../pdf/pages/pdfjsLoader';
import { formatPdfLocation } from '../../studyDesk/pageGeometry';
import type { DeskItem } from '../../studyDesk/types';
import type { BookMeta } from '../../types';
import { short } from '../passages';
import { boxOnPage, livePlace, type LivePlace, type LiveView } from './places';
import { useLiveBook } from './useLiveBook';
import '../../readerCore/chapterHtml.css';

export interface Kept {
  location: string;
  text: string;
  chapterLabel: string;
  image?: Blob;
}

/** What the Muqābala screen asks of a pane, to draw its wires and follow a link. */
export interface LivePaneHandle {
  /** The viewport height of a passage's first line, or null when it is not laid out here (another chapter or view). */
  yOf(id: string): number | null;
  /** A passage not laid out here comes before what the pane shows. */
  before(id: string): boolean;
  /** The pane's scrolling area on screen. */
  box(): DOMRect | null;
  /** Scrolls to a passage (turning to its chapter); false when it was kept in the other view. */
  reveal(id: string): boolean;
}

interface Props {
  book: BookMeta;
  view: LiveView;
  passages: DeskItem[];
  /** The passage picked on this side, those with links across, and the chosen link's end. */
  picked: string | null;
  linked: Set<string>;
  on: Set<string>;
  /** A passage to open at. */
  start?: string;
  onPick(id: string): void;
  onKeep(kept: Kept): Promise<void>;
  /** Scrolled or laid out again: the wires follow. */
  onMove(): void;
}

interface Sel {
  kept: Kept;
  /** Where the Keep button goes, in the sheet's own coordinates. */
  x: number;
  y: number;
}

/**
 * One side of Muqābala, live: the book's own text (chapter by chapter, as the reader renders it) or its PDF pages,
 * with the passages kept from it marked. Click a mark to pick it; select new words to keep them and pick them.
 */
export const LivePane = forwardRef<LivePaneHandle, Props>(function LivePane(props, ref) {
  const live = useLiveBook(props.book, props.view);
  const scroller = useRef<HTMLDivElement>(null);
  const places = useMemo(() => new Map(props.passages.map((p) => [p.id, livePlace(p)] as const)), [props.passages]);
  const [chapter, setChapter] = useState(() => {
    const p = props.start ? places.get(props.start) : null;
    return p?.view === 'text' ? p.chapter : loadCleanPosition(props.book.id).chapter;
  });
  const [page, setPage] = useState(1);
  const revealing = useRef<string | null>(props.start ?? null);

  const at = live.state === 'text' ? Math.min(chapter, live.htmls.length - 1) : chapter;
  const where = (id: string): LivePlace | null => {
    const p = places.get(id) ?? null;
    return p && p.view === props.view ? p : null;
  };

  const scrollTo = useCallback((el: Element | null) => {
    const sc = scroller.current;
    if (!el || !sc) return false;
    const r = el.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    sc.scrollTop += r.top - s.top - s.height / 3;
    return true;
  }, []);
  const mark = (id: string) => scroller.current?.querySelector(`[data-psg="${CSS.escape(id)}"]`) ?? null;

  useImperativeHandle(ref, () => ({
    yOf(id) {
      const el = mark(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top + Math.min(r.height / 2, 12);
    },
    before(id) {
      const p = where(id);
      if (!p) return true;
      return p.view === 'text' ? p.chapter < at : p.page < page;
    },
    box: () => scroller.current?.getBoundingClientRect() ?? null,
    reveal(id) {
      const p = where(id);
      if (!p) return false;
      if (p.view === 'text' && p.chapter !== at) {
        revealing.current = id;
        setChapter(p.chapter);
        return true;
      }
      scrollTo(mark(id));
      return true;
    },
  }));

  const onScroll = () => {
    props.onMove();
    if (live.state !== 'pages' || !scroller.current) return;
    // The page under the pane's upper third: what the header shows.
    const s = scroller.current.getBoundingClientRect();
    const line = s.top + s.height / 3;
    for (const el of scroller.current.querySelectorAll<HTMLElement>('[data-livepage]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom >= line) {
        setPage(Number(el.dataset.livepage));
        break;
      }
    }
  };

  // New words: a selection inside this pane's text or text layer.
  const sheet = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSel(readSelection(sheet.current, live.state === 'text' ? at : null, live.state === 'text' ? live.titles[at] : '')));
    };
    document.addEventListener('selectionchange', read);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', read);
    };
  }, [live, at]);

  const [busy, setBusy] = useState(false);
  const keep = async (kept: Kept) => {
    if (busy) return;
    setBusy(true);
    try {
      await props.onKeep(kept);
      window.getSelection()?.removeAllRanges();
      setSel(null);
    } finally {
      setBusy(false);
    }
  };

  // A click on a marked passage (the marks let clicks through, so words under them can still be selected).
  const onClick = (e: React.MouseEvent) => {
    if (!window.getSelection()?.isCollapsed) return;
    for (const el of scroller.current?.querySelectorAll<HTMLElement>('[data-psg]') ?? []) {
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        props.onPick(el.dataset.psg!);
        return;
      }
    }
  };

  const here = props.passages.filter((p) => !!where(p.id));
  const elsewhere = props.passages.length - here.length;
  const markProps = (id: string) => {
    const item = props.passages.find((p) => p.id === id);
    return { 'data-psg': id, 'data-m': item?.move, 'data-picked': props.picked === id || undefined, 'data-linked': props.linked.has(id) || undefined, 'data-on': props.on.has(id) || undefined };
  };

  return (
    <div className="th-live">
      <div className="th-live__bar">
        {live.state === 'text' && (
          <>
            <button type="button" className="sd-pill" aria-label="Chapter before" disabled={at <= 0} onClick={() => setChapter(at - 1)}>
              ‹
            </button>
            <select className="th-switch th-live__chapter" aria-label="Chapter" value={at} onChange={(e) => setChapter(Number(e.target.value))}>
              {live.titles.map((t, i) => (
                <option key={i} value={i}>
                  {short(t, 48)}
                  {here.some((p) => (places.get(p.id) as { chapter?: number } | null)?.chapter === i) ? ' •' : ''}
                </option>
              ))}
            </select>
            <button type="button" className="sd-pill" aria-label="Chapter after" disabled={at >= live.htmls.length - 1} onClick={() => setChapter(at + 1)}>
              ›
            </button>
          </>
        )}
        {live.state === 'pages' && (
          <span className="th-faint">
            Page {page} of {live.pages}
          </span>
        )}
        {here.length > 0 && (
          <select
            className="th-switch th-live__go"
            aria-label="Go to a kept passage"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id && !scrollTo(mark(id))) {
                revealing.current = id;
                const p = where(id);
                if (p?.view === 'text') setChapter(p.chapter);
              }
            }}
          >
            <option value="">Kept here ({here.length})</option>
            {here.map((p) => (
              <option key={p.id} value={p.id}>
                {p.source?.chapterLabel ? `${short(p.source.chapterLabel, 18)} · ` : ''}
                {short(p.text || '', 50)}
              </option>
            ))}
          </select>
        )}
      </div>
      {elsewhere > 0 && <p className="th-faint th-live__note">{elsewhere === 1 ? 'One passage was' : `${elsewhere} passages were`} kept in the {props.view === 'text' ? 'PDF pages' : 'text'} view.</p>}
      <div className="th-live__scroll" ref={scroller} onScroll={onScroll} onClick={onClick}>
        <div className="th-live__sheet" ref={sheet}>
          {live.state === 'loading' && <p className="th-faint th-live__msg">Opening the book…</p>}
          {live.state === 'error' && <p className="th-faint th-live__msg">{live.message}</p>}
          {live.state === 'text' && (
            <LiveChapter
              key={at}
              chapter={at}
              html={live.htmls[at]}
              marks={here.flatMap((p) => {
                const pl = where(p.id);
                return pl?.view === 'text' && pl.chapter === at ? [{ id: p.id, start: pl.start, end: pl.end }] : [];
              })}
              markProps={markProps}
              onLaid={() => {
                const id = revealing.current;
                revealing.current = null;
                if (!id || !scrollTo(mark(id))) scroller.current?.scrollTo({ top: 0 });
                props.onMove();
              }}
            />
          )}
          {live.state === 'pages' && (
            <LivePages
              pdf={live.pdf}
              pages={live.pages}
              root={scroller}
              boxes={here.flatMap((p) => {
                const pl = where(p.id);
                return pl?.view === 'pages' ? [{ id: p.id, ...pl }] : [];
              })}
              markProps={markProps}
              onRegion={(kept) => void keep(kept)}
              onLaid={(first) => {
                const id = revealing.current;
                revealing.current = null;
                if (!id || !scrollTo(mark(id))) {
                  const p = first ? loadPdfPage(props.book.id) : 0;
                  if (p > 1) scrollTo(scroller.current?.querySelector(`[data-livepage="${p}"]`) ?? null);
                }
                props.onMove();
              }}
            />
          )}
          {sel && (
            <button
              type="button"
              className="sd-btn sd-btn--pri th-live__keep"
              style={{ left: sel.x, top: sel.y }}
              disabled={busy}
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                void keep(sel.kept);
              }}
            >
              Keep these words
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

type MarkProps = (id: string) => Record<string, unknown>;

/** A chapter's text, with the kept passages in it marked over it (the marks sit outside the text, so offsets hold). */
function LiveChapter({ chapter, html, marks, markProps, onLaid }: { chapter: number; html: string; marks: { id: string; start: number; end: number }[]; markProps: MarkProps; onLaid(): void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<{ id: string; l: number; t: number; w: number; h: number }[] | null>(null);
  const [width, setWidth] = useState(0);
  const key = marks.map((m) => `${m.id}:${m.start}:${m.end}`).join();
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const root = text.current;
    const w = wrap.current?.getBoundingClientRect();
    if (!root || !w) return;
    const out: NonNullable<typeof boxes> = [];
    for (const m of marks) {
      const range = rangeAt(root, m.start, m.end);
      if (!range) continue;
      for (const r of range.getClientRects()) if (r.width > 1) out.push({ id: m.id, l: r.left - w.left, t: r.top - w.top, w: r.width, h: r.height });
    }
    setBoxes(out);
    // marks is new each render; its key says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, html]);
  // Once the marks are on the page: open at a passage, or at the top.
  const laid = useRef(false);
  useLayoutEffect(() => {
    if (laid.current || !boxes) return;
    laid.current = true;
    onLaid();
  });
  return (
    <div className="th-live__chapterwrap" ref={wrap}>
      <div ref={text} className="th-live__text" data-livechapter={chapter} dir="rtl" lang="ar" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="th-live__marks" aria-hidden="true">
        {boxes?.map((b, i) => (
          <span key={i} className="th-live__mark" style={{ left: b.l, top: b.t, width: b.w, height: b.h }} {...markProps(b.id)} />
        ))}
      </div>
    </div>
  );
}

/** Every page as a frame; the ones near the pane's view are drawn (picture and text layer), with their marks. */
function LivePages({
  pdf,
  pages,
  root,
  boxes,
  markProps,
  onRegion,
  onLaid,
}: {
  pdf: OpenedPdf;
  pages: number;
  root: React.RefObject<HTMLDivElement | null>;
  boxes: ({ id: string } & { page: number; x: number; y: number; w: number; h: number })[];
  markProps: MarkProps;
  onRegion(kept: Kept): void;
  onLaid(first: boolean): void;
}) {
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const [near, setNear] = useState<Set<number>>(new Set());
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth - 24)));
    ro.observe(el);
    // The pane may close (and the PDF with it) before the first page answers.
    pdf.doc
      .getPage(1)
      .then((p) => {
        const v = p.getViewport({ scale: 1 });
        setRatio(v.height / v.width);
      })
      .catch(() => undefined);
    return () => ro.disconnect();
  }, [pdf, root]);
  const frames = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !width) return;
    const io = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.livepage);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        }),
      { root: el, rootMargin: '120% 0px' }
    );
    frames.current?.querySelectorAll('[data-livepage]').forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, [root, width, pages]);
  // Laid out (and again when the pane's width changes): open at a passage, or where the book was last read.
  const laid = useRef(0);
  useLayoutEffect(() => {
    if (!width || !ratio || laid.current === width) return;
    onLaid(laid.current === 0);
    laid.current = width;
  });
  return (
    <div className="th-live__pages" ref={frames}>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <LivePage key={n} pdf={pdf} number={n} width={width} ratio={ratio ?? 1.414} drawn={near.has(n)} boxes={boxes.filter((b) => b.page === n)} markProps={markProps} onRegion={onRegion} />
      ))}
    </div>
  );
}

function LivePage({
  pdf,
  number,
  width,
  ratio,
  drawn,
  boxes,
  markProps,
  onRegion,
}: {
  pdf: OpenedPdf;
  number: number;
  width: number;
  ratio: number;
  drawn: boolean;
  boxes: { id: string; x: number; y: number; w: number; h: number }[];
  markProps: MarkProps;
  onRegion(kept: Kept): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<number | null>(null);
  const [scanned, setScanned] = useState(false);
  useEffect(() => {
    if (!drawn || !width) return;
    const canvasEl = canvas.current;
    const layerEl = layer.current;
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    let text: { cancel(): void } | null = null;
    (async () => {
      page = await pdf.doc.getPage(number);
      if (cancelled || !canvasEl || !layerEl) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      setOwn(base.height / base.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasEl.width = Math.floor(viewport.width * dpr);
      canvasEl.height = Math.floor(viewport.height * dpr);
      canvasEl.style.width = `${viewport.width}px`;
      canvasEl.style.height = `${viewport.height}px`;
      const context = canvasEl.getContext('2d');
      if (!context) return;
      task = page.render({ canvasContext: context, canvas: canvasEl, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      const content = await page.getTextContent();
      if (cancelled) return;
      layerEl.replaceChildren();
      layerEl.style.setProperty('--total-scale-factor', String(scale));
      const tl = new pdf.pdfjs.TextLayer({ textContentSource: content, container: layerEl, viewport });
      text = tl;
      setScanned(!content.items.some((it) => 'str' in it && it.str.trim()));
      await Promise.all([task.promise, tl.render()]).catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e;
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
      text?.cancel();
      page?.cleanup();
      layerEl?.replaceChildren();
      if (canvasEl) {
        canvasEl.width = 0;
        canvasEl.height = 0;
      }
    };
  }, [drawn, number, pdf, width]);

  // A scanned page has no words to select: drag a box round them instead.
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const local = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const finish = async () => {
    const d = drag;
    setDrag(null);
    const el = frame.current;
    if (!d || !el || !canvas.current) return;
    const l = Math.min(d.x0, d.x1);
    const t = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w < 8 || h < 8) return;
    const fw = el.offsetWidth;
    const fh = el.offsetHeight;
    const c = canvas.current;
    const sx = c.width / fw;
    const sy = c.height / fh;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * sx));
    out.height = Math.max(1, Math.round(h * sy));
    out.getContext('2d')?.drawImage(c, l * sx, t * sy, out.width, out.height, 0, 0, out.width, out.height);
    const image = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    onRegion({ location: formatPdfLocation(number, l / fw, t / fh, w / fw, h / fh), text: '', chapterLabel: `Page ${number}`, image: image ?? undefined });
  };

  const height = width * (own ?? ratio);
  return (
    <div
      ref={frame}
      className="th-live__page"
      data-livepage={number}
      data-scanned={scanned || undefined}
      style={{ width, height }}
      onPointerDown={(e) => {
        if (!scanned || e.button !== 0) return;
        const p = local(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, ...((p) => ({ x1: p.x, y1: p.y }))(local(e)) })}
      onPointerUp={() => void finish()}
      onPointerCancel={() => setDrag(null)}
    >
      {!drawn && <span className="th-live__pagenum">{number}</span>}
      <canvas ref={canvas} className="th-live__canvas" />
      <div ref={layer} className="th-live-text" data-livelayer={number} />
      {boxes.map((b) => (
        <span key={b.id} className="th-live__mark" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} {...markProps(b.id)} />
      ))}
      {drag && <span className="th-live__drag" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
    </div>
  );
}

/** The selection, when it lies in this pane: in one chapter's text, or on one page's text layer. */
function readSelection(sheet: HTMLElement | null, chapter: number | null, title: string): Sel | null {
  const s = window.getSelection();
  if (!sheet || !s || s.isCollapsed || !s.rangeCount) return null;
  const range = s.getRangeAt(0);
  if (!sheet.contains(range.commonAncestorContainer)) return null;
  const words = s.toString().replace(/\s+/g, ' ').trim();
  if (!words) return null;
  const sr = sheet.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
  const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
  const spot = { x: Math.max(0, Math.min(sr.width - 150, last.left - sr.left)), y: last.bottom - sr.top + 6 };
  const node = range.commonAncestorContainer;
  const el = node instanceof Element ? node : node.parentElement;
  const text = el?.closest<HTMLElement>('[data-livechapter]');
  if (text && chapter !== null) {
    const start = offsetWithin(text, range.startContainer, range.startOffset);
    const end = offsetWithin(text, range.endContainer, range.endOffset);
    if (end <= start) return null;
    const heading = text.querySelector('h1, h2, h3')?.textContent?.trim();
    return { kept: { location: formatCleanLocation({ chapter, start, end }), text: words, chapterLabel: heading || title || `Chapter ${chapter + 1}` }, ...spot };
  }
  const page = el?.closest<HTMLElement>('[data-livepage]');
  if (!page) return null;
  const n = Number(page.dataset.livepage);
  const box = boxOnPage(rects, page.getBoundingClientRect());
  if (!box) return null;
  return { kept: { location: formatPdfLocation(n, box.x, box.y, box.w, box.h), text: words, chapterLabel: `Page ${n}` }, ...spot };
}
