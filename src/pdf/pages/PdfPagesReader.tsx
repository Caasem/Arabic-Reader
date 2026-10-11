import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DictionaryBubble } from '../../components/reader/DictionaryBubble';
import { DictionaryPopup } from '../../components/reader/DictionaryPopup';
import { VocabularyEditModal } from '../../components/reader/VocabularyEditModal';
import { useWordLookups } from '../../components/reader/hooks/useWordLookups';
import type { SavedWords } from '../../components/reader/hooks/useSavedWords';
import { openDictionaryPage } from '../../dictionaryPage/events';
import { senseText } from '../../dictionary/senseText';
import { logDiagnostic } from '../../diagnostics/diagnosticsLog';
import { persistenceService } from '../../persistence';
import { ReadingSessionTracker } from '../../reader/session';
import { usePreferences } from '../../state/PreferencesContext';
import type { BookMeta, Bookmark, Highlight, VocabularyItem } from '../../types';
import { openPdfPages, type OpenedPdf, type PDFPageProxy } from './pdfjsLoader';
import { rememberCorrection } from '../ocr/corrections';
import { pdfPageExtensions, type PdfWordTap } from './extensions';
import { loadPdfPage, savePdfPage } from './pdfView';
import { wordAtPoint } from './wordAtPoint';
import { Header, ProgressRail, TurnButtons } from '../../quietReader/Chrome';
import { formatClock, remainingMs, usePomodoroSnapshot } from '../../quietReader/pomodoroClock';
import { TimerPopover } from '../../quietReader/TimerPopover';
import { useMarks } from '../../quietReader/useMarks';
import { BookDrawer, type BookmarkRow, type ChapterRow, type DrawerTab, type HighlightRow } from '../../quietReader/BookDrawer';
import { MarginLevels } from '../../quietReader/MarginLevels';
import { useReaderSearch, type SearchHit } from '../../readerCore/searchState';
import { searchForms, searchTexts } from '../../readerCore/cleanSearch';
import { clearPaint, flash, paintSearchMatch } from '../../readerCore/paint';
import { formatCleanLocation } from '../../readerCore/location';
import { normalize } from '../../reader/tokenizer/arabicTokenizer';
import { registerBookNavigator, type LocationHint } from '../../readerChords';
import { vocabularyService } from '../../vocabulary';
import { outlineEntryAt, usePdfOutline, type PdfOutlineEntry } from './pdfOutline';
import { pdfPageText, pdfTextModel, rangeInTextLayer, textLayerOf, usePdfTextModel } from './pdfText';
import '../../quietReader/quietReader.css';
import { dockButtonX, ReaderDock, readToolId, setFocusWhere, setReaderFocus, useReaderFocus, useReadTools, type ReadToolId } from '../../readerTools';
import { PdfDisplaySheet, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './PdfDisplaySheet';
import './pdfPages.css';

const PAGE_GAP_PX = 14;
const SIDE_PX = 16;
const AHEAD = 2;

const noSavedWords: SavedWords = { applyTo() {}, setSaved() {} };

interface PageProps {
  book: BookMeta;
  opened: OpenedPdf;
  number: number;
  width: number;
  /** Near the page being read: draw it. Otherwise only the empty frame is kept. */
  active: boolean;
  onWord(layer: HTMLElement, x: number, y: number, page: number): void | Promise<void>;
}

/** One page: a canvas with the picture and a transparent text layer over it for word taps. */
const PdfPage = memo(function PdfPage({ book, opened, number, width, active, onWord }: PageProps) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvasEl = canvas.current;
    const layerEl = textLayer.current;
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    let layer: { cancel(): void } | null = null;
    (async () => {
      page = await opened.doc.getPage(number);
      if (cancelled || !canvas.current || !textLayer.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      setRatio(base.height / base.width);
      const el = canvas.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.floor(viewport.width * dpr);
      el.height = Math.floor(viewport.height * dpr);
      el.style.width = `${viewport.width}px`;
      el.style.height = `${viewport.height}px`;
      const context = el.getContext('2d');
      if (!context) return;
      task = page.render({ canvasContext: context, canvas: el, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      const content = await page.getTextContent();
      if (cancelled || !textLayer.current) return;
      const host = textLayer.current;
      host.replaceChildren();
      host.style.setProperty('--total-scale-factor', String(scale));
      const text = new opened.pdfjs.TextLayer({ textContentSource: content, container: host, viewport });
      layer = text;
      await Promise.all([task.promise, text.render()]).catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e;
      });
    })().catch((e) => logDiagnostic('error', 'reader', `Could not draw PDF page ${number}`, e));
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
      page?.cleanup();
      layerEl?.replaceChildren();
      if (canvasEl) {
        canvasEl.width = 0;
        canvasEl.height = 0;
      }
    };
  }, [active, number, opened, width]);

  return (
    <div
      ref={frame}
      className="pdfp-page"
      data-page={number}
      style={{ width, height: ratio ? width * ratio : width * 1.414 }}
      aria-label={`Page ${number}`}
    >
      {!active && <span className="pdfp-page__number">{number}</span>}
      <canvas ref={canvas} className="pdfp-page__canvas" />
      <div
        ref={textLayer}
        className="pdfp-text textLayer"
        onClick={(e) => {
          if (e.detail > 1) return;
          void onWord(e.currentTarget, e.clientX, e.clientY, number);
        }}
      />
      {active &&
        ratio !== null &&
        pdfPageExtensions().map((ext) => ext.Layer && <ext.Layer key={ext.id} book={book} opened={opened} page={number} width={width} height={width * ratio} />)}
    </div>
  );
});

const NARROW_PX = 760;
const HEADER_PX = 64;
/** Narrower than this (the desk margin or a panel takes room), where you are sits above the dock, not beside it. */
const COMPACT_PX = 980;
const LEVELS_WIDTH = 372;
/** The least room the pages keep when Levels opens beside them. */
const MIN_PAGES_PX = 720;
const DRAWER_WIDTH = 404;
/** Contents without an outline: every page, or every tenth in a long book. */
const pageEntries = (total: number): PdfOutlineEntry[] => {
  const every = total > 400 ? 10 : 1;
  return Array.from({ length: Math.ceil(total / every) }, (_, i) => ({ title: `Page ${i * every + 1}`, page: i * every + 1, depth: 0 }));
};
/** Room at each side for the page-turn buttons, when they show. */
const GUTTER_PX = 88;

/** `pdf:page=12` (bookmarks, words saved from the pages, places opened from elsewhere) → 12. */
export const pageOfLocation = (location?: string | null): number | null => {
  const m = /^pdf:page=(\d+)/.exec(location ?? '');
  return m ? Number(m[1]) : null;
};

interface Props {
  book: BookMeta;
  onBack(): void;
  /** The book's text reflowed: Display -> PDF -> Reflowed text. */
  onShowText?(): void;
  onOpenSettings?(group?: string): void;
  /** A place to open at instead of the saved page: `pdf:page=N`. */
  initialLocation?: string;
  /** Opens another book at a place (Search, Library scope). */
  onOpenBookAt?(book: BookMeta, location?: string): void;
  /** The app's Vocab Levels tab opens the levels margin. */
  levelsOpen?: boolean;
  onLevelsOpenChange?(open: boolean): void;
}

/**
 * The original pages of a book added from a PDF, in the reader's frame (src/quietReader): its header, the shared
 * dock (src/readerTools), page turns at the sides, where you are, and the progress rail. Pages are fit-to-width in
 * a scrolling column, drawn a couple of pages ahead; Display or Ctrl+wheel zooms. Words are tapped through the
 * PDF's own text layer (or an extension, such as text recognition on a scanned page) and go to the same
 * dictionary popup as in the reader.
 */
export function PdfPagesReader({ book, onBack, onShowText, onOpenSettings, initialLocation, onOpenBookAt, levelsOpen, onLevelsOpenChange }: Props) {
  const { prefs } = usePreferences();
  const prefsRef = useRef(prefs);
  useLayoutEffect(() => {
    prefsRef.current = prefs;
  });

  const [opened, setOpened] = useState<OpenedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => pageOfLocation(initialLocation) ?? loadPdfPage(book.id));
  const [zoom, setZoom] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  const total = opened?.doc.numPages ?? book.pdf?.pages ?? 0;

  const focus = useReaderFocus().on;
  const chrome = !focus;
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [frameW, setFrameW] = useState(0);
  const [sheet, setSheet] = useState<'display' | 'timer' | null>(null);
  const [timerX, setTimerX] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const [levelsOwn, setLevelsOwn] = useState(false);
  const levels = levelsOpen ?? levelsOwn;
  const setLevels = useCallback((open: boolean) => (onLevelsOpenChange ? onLevelsOpenChange(open) : setLevelsOwn(open)), [onLevelsOpenChange]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<VocabularyItem[] | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const bumpSaved = useCallback(() => setSavedVersion((v) => v + 1), []);
  const marks = useMarks(book);
  const snapshot = usePomodoroSnapshot();

  const lookups = useWordLookups({
    book,
    trackerRef,
    savedWords: noSavedWords,
    prefsRef,
    onLookupStart: () => {},
    // A fix to a word read from a scan is kept for this book (src/pdf/ocr).
    onWordCorrected: (ocr, corrected) => rememberCorrection(book.id, ocr, corrected),
  });
  const { popup, bubble, editing } = lookups;

  // Open the PDF kept at import.
  const initialRef = useRef(initialLocation);
  useEffect(() => {
    let cancelled = false;
    let current: OpenedPdf | null = null;
    (async () => {
      const file = await persistenceService.getPdfOriginal(book.id);
      if (!file) throw new Error('The original PDF is not on this device.');
      const pdf = await openPdfPages(new Uint8Array(await file.arrayBuffer()));
      if (cancelled) return void pdf.destroy();
      current = pdf;
      const start = Math.min(pageOfLocation(initialRef.current) ?? loadPdfPage(book.id), pdf.doc.numPages);
      pageRef.current = start;
      setPage(start);
      const tracker = new ReadingSessionTracker(book.id, book.title, (start - 1) / pdf.doc.numPages);
      tracker.start();
      trackerRef.current = tracker;
      setOpened(pdf);
    })().catch((e) => {
      if (cancelled) return;
      logDiagnostic('error', 'reader', `Could not open the PDF pages of "${book.title}"`, e);
      setError(e instanceof Error && e.message.startsWith('The original') ? e.message : 'This PDF could not be shown.');
    });
    return () => {
      cancelled = true;
      void trackerRef.current?.finish();
      trackerRef.current = null;
      void current?.destroy();
    };
  }, [book.id, book.title]);

  // The reader's size (narrow layout) and the frame's width (the dock's centre).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    if (!root || !frame) return;
    const measure = () => {
      setSize({ w: root.clientWidth, h: root.clientHeight });
      setFrameW(frame.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Fit to the stage; follow it when the window changes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageWidth(stage.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [opened]);

  const narrow = size.w < NARROW_PX;
  const side = chrome && !narrow ? GUTTER_PX : SIDE_PX;
  const pageWidth = Math.round(Math.max(0, stageWidth - side * 2) * zoom);

  const frameOf = (n: number) => stageRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null;

  const goTo = useCallback(
    (n: number) => {
      const target = Math.min(Math.max(n, 1), total || 1);
      frameOf(target)?.scrollIntoView({ block: 'start' });
      pageRef.current = target;
      setPage(target);
      savePdfPage(book.id, target);
    },
    [total, book.id]
  );

  // Put the saved page at the top once the frames have a size, and again if zoom changes their heights.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!opened || !pageWidth) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      requestAnimationFrame(() => frameOf(pageRef.current)?.scrollIntoView({ block: 'start' }));
    }
  }, [opened, pageWidth]);

  // A new place to open while this book is already open (a bookmark opened from the Highlights page).
  useEffect(() => {
    if (!opened || initialLocation === initialRef.current) return;
    initialRef.current = initialLocation;
    const n = pageOfLocation(initialLocation);
    if (n) goTo(n);
  }, [opened, initialLocation, goTo]);

  const scrollTick = useRef(0);
  function handleScroll() {
    trackerRef.current?.recordActivity();
    cancelAnimationFrame(scrollTick.current);
    scrollTick.current = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage || !total) return;
      const line = stage.getBoundingClientRect().top + stage.clientHeight * 0.35;
      let current = pageRef.current;
      for (const el of stage.querySelectorAll<HTMLElement>('.pdfp-page')) {
        if (el.getBoundingClientRect().bottom > line) {
          current = Number(el.dataset.page);
          break;
        }
      }
      if (current !== pageRef.current) {
        pageRef.current = current;
        setPage(current);
        savePdfPage(book.id, current);
        trackerRef.current?.recordPercent((current - 1) / total);
      }
    });
  }

  /** Right-to-left (the default): the left side is "next". */
  const nextIsLeft = prefs.pageDirection !== 'ltr';
  const turn = (sideOf: 'left' | 'right') => goTo(pageRef.current + ((sideOf === 'left') === nextIsLeft ? 1 : -1));
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // Keys: the arrows turn pages the way the side buttons do, PageDown/PageUp too, Ctrl+/- zoom.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lookups.handleSpaceSave(e)) return;
      void lookups.handleQuickAddKey(e);
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing || e.altKey || e.metaKey) return;
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
      else if (e.ctrlKey && e.key === '-') setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
      else if (e.ctrlKey) return;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') turnRef.current(e.key === 'ArrowLeft' ? 'left' : 'right');
      else if (e.key === 'PageDown') goTo(pageRef.current + 1);
      else if (e.key === 'PageUp') goTo(pageRef.current - 1);
      else if (e.key === 'Escape') {
        if (lookups.popup || lookups.editing) lookups.closeAll();
        else if (sheet) setSheet(null);
        else if (lookups.bubble) lookups.closeBubble();
        else if (drawer) setDrawer(null);
        else if (levels) setLevels(false);
        else return;
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return;
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - e.deltaY * 0.002)));
  }

  const onWord = useCallback(
    async (layer: HTMLElement, x: number, y: number, n: number) => {
      let hit = wordAtPoint(layer, x, y);
      if (!hit && opened) {
        // Nothing in the text layer here: ask the extensions (OCR of the tapped region, for example).
        const frame = layer.parentElement ?? layer;
        const tap: PdfWordTap = { book, opened, page: n, width: frame.clientWidth, height: frame.clientHeight, frame, clientX: x, clientY: y };
        for (const ext of pdfPageExtensions()) {
          hit = (await ext.wordAt?.(tap).catch(() => null)) ?? null;
          if (hit) break;
        }
      }
      if (!hit) {
        lookups.closeAll();
        return;
      }
      const rect = { top: hit.rect.top, bottom: hit.rect.bottom, left: hit.rect.left, right: hit.rect.right };
      const target = {
        word: hit.word,
        sectionHref: `pdf:page=${n}`,
        element: hit.element,
        rect,
        x: (rect.left + rect.right) / 2,
        y: rect.top,
        sentence: hit.run.trim() || undefined,
        ocr: hit.ocr,
      };
      void lookups.openPopup(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookups.openPopup, opened, book]
  );

  // --- The PDF's text and contents, for the drawer and the margin -------------------------------------
  const outline = usePdfOutline(opened);
  const pdfText = usePdfTextModel(opened, book.title, drawer === 'search' || drawer === 'words' || levels);
  const pdfTextRef = useRef(pdfText);
  pdfTextRef.current = pdfText;
  const search = useReaderSearch({
    book,
    model: pdfText?.model ?? null,
    chapter: page - 1,
    liveSearch: prefs.liveSearchEnabled,
    history: prefs.searchHistoryEnabled,
  });

  /** Goes to page `n` and, once its text layer is drawn, marks letters [start, end) of its text. */
  const showOnPage = useCallback(
    async (n: number, start?: number, end?: number) => {
      goTo(n);
      if (!opened || start === undefined || end === undefined || end <= start) return;
      const [layer, text] = await Promise.all([textLayerOf(stageRef.current, n), pdfPageText(opened, n)]);
      const range = layer && rangeInTextLayer(layer, text, start, end);
      if (!range) return;
      // The page is already at the top; zoomed in, the word may still be out of sight.
      range.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      flash(range);
    },
    [goTo, opened]
  );

  /** Where a saved word is: the page it was saved on, else its first page in the text; with the word on it. */
  const locateWord = useCallback(
    async (item: VocabularyItem): Promise<{ page: number; start?: number; end?: number } | null> => {
      if (!opened) return null;
      const forms = new Set([normalize(item.surfaceForm)]);
      const saved = pageOfLocation(item.chapterHref) ?? pageOfLocation(item.location);
      if (saved) {
        const hit = searchForms([(await pdfPageText(opened, saved)).text], forms)[0];
        return { page: saved, start: hit?.start, end: hit?.end };
      }
      const { model } = await pdfTextModel(opened, book.title);
      const hit = searchForms(model.texts, forms)[0];
      return hit ? { page: hit.chapter + 1, start: hit.start, end: hit.end } : null;
    },
    [opened, book.title]
  );

  // Alt+S and Alt+V (src/readerChords) jump to `pdf:page=N` places, onto the word when they say which.
  useEffect(
    () =>
      registerBookNavigator((target: string, hint?: LocationHint) => {
        const n = pageOfLocation(target);
        if (!n || !opened) return false;
        if (!hint?.text) return void goTo(n);
        void pdfPageText(opened, n).then((text) => {
          const hit = searchTexts([text.text], hint.text!, 'phrase')[0];
          void showOnPage(n, hit?.start, hit?.end);
        });
      }),
    [opened, goTo, showOnPage]
  );

  // Saved words for the Words tab and Levels, refreshed when a word is saved or removed.
  useEffect(() => {
    if (drawer !== 'words' && !levels) return;
    let stale = false;
    void vocabularyService.listForBook(book.id).then((list) => !stale && setSavedItems(list));
    return () => {
      stale = true;
    };
  }, [book.id, drawer, levels, popup?.saved, savedVersion, lookups.touchToast, lookups.quickAddToast]);

  // The active search match, drawn while the Search tab is open.
  const activeHit = drawer === 'search' ? search.hits?.[search.active] : undefined;
  useEffect(() => {
    if (!activeHit || activeHit.chapter < 0 || activeHit.book.id !== book.id || !opened) return paintSearchMatch(null);
    let stale = false;
    const n = activeHit.chapter + 1;
    void Promise.all([textLayerOf(stageRef.current, n), pdfPageText(opened, n)]).then(([layer, text]) => {
      if (!stale) paintSearchMatch(layer && rangeInTextLayer(layer, text, activeHit.start, activeHit.end));
    });
    return () => {
      stale = true;
    };
  }, [activeHit, book.id, opened]);
  useEffect(() => () => clearPaint(), []);

  function pickHit(hit: SearchHit) {
    if (hit.chapter < 0) return;
    if (hit.book.id !== book.id) return onOpenBookAt?.(hit.book, formatCleanLocation(hit));
    void showOnPage(hit.chapter + 1, hit.start, hit.end);
    if (narrow) setDrawer(null);
  }

  // --- Marks: bookmarks, one per page -----------------------------------------------------------------
  const percent = total ? (page - 1) / total : 0;
  const pct = Math.round(percent * 100);
  const pageBookmarks = marks.bookmarks.filter((b) => pageOfLocation(b.cfi) === page);
  const bookmarked = pageBookmarks.length > 0;
  async function toggleBookmark() {
    if (bookmarked) {
      for (const b of pageBookmarks) await marks.removeBookmark(b.id);
      return;
    }
    const entry = outlineEntryAt(outline, page);
    await marks.addBookmark({ location: `pdf:page=${page}`, percent, pageLabel: `Page ${page}`, chapterHref: `pdf:page=${page}`, chapterLabel: entry?.title ?? '' });
  }

  const bookmarkRows: BookmarkRow[] = marks.bookmarks
    .map((b) => ({ b, n: pageOfLocation(b.cfi) }))
    .filter((x): x is { b: Bookmark; n: number } => x.n !== null)
    .sort((x, y) => x.n - y.n)
    .map(({ b, n }) => ({
      id: b.id,
      label: b.chapterLabel || `Page ${n}`,
      where: `Page ${n}${n === page ? ' · this page' : ''}`,
      open: () => goTo(n),
      remove: () => void marks.removeBookmark(b.id),
    }));

  const highlightRows: HighlightRow[] = marks.highlights
    .map((h) => ({ h, n: pageOfLocation(h.cfiRange) }))
    .filter((x): x is { h: Highlight; n: number } => x.n !== null)
    .sort((x, y) => x.n - y.n)
    .map(({ h, n }) => ({
      highlight: h,
      open: () => goTo(n),
      recolor: (color) => void marks.recolor(h, color),
      saveNote: (text) => void marks.setNote(h, text),
      remove: () => void marks.removeHighlight(h.id),
    }));

  // --- Contents: the PDF's own outline, else its pages ------------------------------------------------
  const chapterRows: ChapterRow[] = (() => {
    const entries = outline.length ? outline : pageEntries(total);
    return entries.map((e, i) => {
      const next = entries.slice(i + 1).find((x) => x.depth <= e.depth)?.page ?? total + 1;
      const last = Math.max(e.page, next - 1);
      const current = page >= e.page && page <= last && outlineEntryAt(entries, page) === e;
      return {
        title: ' '.repeat(e.depth) + e.title,
        meta: current ? `Reading now · page ${page}` : last > e.page ? `Pages ${e.page}–${last}` : `Page ${e.page}`,
        read: page > last ? 1 : page < e.page ? 0 : (page - e.page + 1) / (last - e.page + 1),
        current,
        go: () => goTo(e.page),
      };
    });
  })();
  const chapterTitle = outlineEntryAt(outline, page)?.title;
  const ticks = total ? outline.filter((e) => e.depth === 0 && e.page > 1).map((e) => (e.page - 1) / total) : [];

  // --- The dock ---------------------------------------------------------------------------------------
  function onDock(id: ReadToolId) {
    if (id === 'contents' || id === 'search' || id === 'marks' || id === 'words') setDrawer((d) => (d === id ? null : id));
    else if (id === 'display' || id === 'timer') {
      if (id === 'timer') setTimerX(dockButtonX(readToolId('timer'), frameRef.current));
      setSheet((s) => (s === id ? null : id));
    } else if (id === 'levels') setLevels(!levels);
    else if (id === 'focus') {
      setSheet(null);
      lookups.closeAll();
      setReaderFocus(true);
    }
  }
  const timerLabel = snapshot ? formatClock(remainingMs(snapshot)) : null;
  useReadTools('pdf', {
    has: ['contents', 'search', 'marks', 'words', 'display', 'levels', 'timer', 'focus'],
    isOn: (id) => sheet === id || drawer === id || (id === 'levels' && levels),
    run: onDock,
    timer: timerLabel,
    titles: {
      contents: 'Contents: the PDF’s own, else its pages',
      search: 'Search the text of these pages, your library or the dictionary',
      display: 'Zoom and display',
      focus: 'Focus: just the pages (Esc to leave)',
    },
  });

  const whereLabel = total ? `Page ${page} of ${total} · ${pct}%` : `Page ${page}`;
  useEffect(() => setFocusWhere(total ? `Page ${page} of ${total}` : `Page ${page}`), [page, total]);
  useEffect(() => () => setFocusWhere(''), []);
  useEffect(() => {
    if (focus) setSheet(null);
  }, [focus]);

  const dockCenter = frameW / 2;
  const padR = !narrow && drawer ? DRAWER_WIDTH : 0;
  // Levels pushes the pages aside only when that leaves them room (the study desk's margin takes some too);
  // otherwise it floats over them.
  const padL = !narrow && levels && size.w - padR - (LEVELS_WIDTH + 48) >= MIN_PAGES_PX ? LEVELS_WIDTH + 48 : 0;
  // Extensions' header controls (the text-recognition chip; the ink's page report) stay mounted in Focus, hidden.
  const extensionBar = opened && pdfPageExtensions().map((ext) => ext.Toolbar && <ext.Toolbar key={ext.id} book={book} page={page} total={total} opened={opened} />);

  return (
    <div
      ref={rootRef}
      className={`qr pdfp pdfp--${prefs.pdfPageTint}` + (narrow ? ' qr--narrow' : '') + (frameW < COMPACT_PX ? ' pdfp--compact' : '') + (focus ? ' qr--focus' : '')}
    >
      {chrome ? (
        <Header
          bookTitle={book.title}
          chapterTitle={chapterTitle}
          bookmarked={bookmarked}
          onBack={onBack}
          onToggleBookmark={() => void toggleBookmark()}
          onOpenSettings={() => onOpenSettings?.()}
          extra={<span className="pdfp__extensions">{extensionBar}</span>}
        />
      ) : (
        <span className="pdfp__extensions" hidden>
          {extensionBar}
        </span>
      )}

      <div className="pdfp__body" style={{ top: chrome ? HEADER_PX : 0, left: padL, right: padR }}>
        <div ref={frameRef} className="pdfp__frame">
          {/* Fit to width never scrolls sideways (a page that fits to the pixel can still raise the bar); zoomed in does. */}
          <div className="pdfp__stage" ref={stageRef} tabIndex={-1} onScroll={handleScroll} onWheel={onWheel} style={{ overflowX: zoom > 1 ? 'auto' : 'hidden' }}>
            {error && <div className="qr-message">{error}</div>}
            {!opened && !error && <div className="qr-message">Opening PDF…</div>}
            {opened && pageWidth > 0 && (
              <div className="pdfp__column" style={{ gap: PAGE_GAP_PX, padding: `${PAGE_GAP_PX}px ${side}px ${chrome ? 120 : 40}px` }}>
                {Array.from({ length: opened.doc.numPages }, (_, i) => i + 1).map((n) => (
                  <PdfPage key={n} book={book} opened={opened} number={n} width={pageWidth} active={Math.abs(n - page) <= AHEAD} onWord={onWord} />
                ))}
              </div>
            )}
          </div>

          {chrome && !narrow && opened && (
            <TurnButtons
              leftLabel={nextIsLeft ? 'Next page' : 'Previous page'}
              rightLabel={nextIsLeft ? 'Previous page' : 'Next page'}
              leftX={20}
              rightX={20}
              onLeft={() => turn('left')}
              onRight={() => turn('right')}
            />
          )}

          {chrome && (
            <>
              <div className="qr-where qr-where--right" style={{ right: 24 }}>
                {whereLabel}
              </div>
              {!narrow && zoom !== 1 && (
                <div className="qr-where qr-where--left" style={{ left: 24 }}>
                  Zoom {Math.round(zoom * 100)}%
                </div>
              )}
              <ReaderDock reader="pdf" center={dockCenter} roomy={frameW >= 860} />
            </>
          )}

          {sheet === 'display' && (
            <PdfDisplaySheet
              center={dockCenter}
              zoom={zoom}
              onZoom={setZoom}
              onShowText={onShowText}
              onOpenSettings={() => onOpenSettings?.('reading')}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet === 'timer' && <TimerPopover book={book} center={timerX ?? dockCenter} onClose={() => setSheet(null)} />}
        </div>
      </div>

      <ProgressRail percent={percent} ticks={ticks} />

      {levels &&
        (pdfText ? (
          <MarginLevels
            book={book}
            model={pdfText.model}
            indexKey={`pdf:${book.id}`}
            savedItems={savedItems ?? []}
            onJump={(_, occ) => void showOnPage(occ.chapter + 1, occ.start, occ.end)}
            onClose={() => setLevels(false)}
          />
        ) : (
          <aside className="qr-margin" aria-label="Vocab levels">
            <p className="qr-empty pdfp__reading">Reading the text of the pages…</p>
          </aside>
        ))}

      {drawer && (
        <BookDrawer
          bookTitle={book.title}
          author={book.author}
          tab={drawer}
          onTab={setDrawer}
          onClose={() => setDrawer(null)}
          contents={{ pageLabel: total ? `Page ${page} of ${total}` : '', percent, chapters: chapterRows }}
          search={search}
          onPickHit={pickHit}
          marks={{
            bookmarked,
            onToggleBookmark: () => void toggleBookmark(),
            bookmarks: bookmarkRows,
            highlights: highlightRows,
            editing: editingNote,
            setEditing: setEditingNote,
            highlightsEmpty: 'To mark words on a PDF page, drag over them: they go to the study desk.',
          }}
          words={{
            items: savedItems,
            onJump: (item) => {
              void locateWord(item).then((at) => at && showOnPage(at.page, at.start, at.end));
              if (narrow) setDrawer(null);
            },
          }}
        />
      )}

      {popup && (
        <DictionaryPopup
          word={popup.word}
          result={popup.result}
          instance={popup.instance}
          saved={popup.saved}
          loading={popup.loading}
          x={popup.x}
          y={popup.y}
          wordRect={popup.wordRect}
          sizePct={prefs.dictionaryPopupSizePct}
          onClose={lookups.closePopup}
          onSave={() => void lookups.togglePopupSave().then(bumpSaved)}
          onSaveEntry={(entry) => lookups.savePopupEntry(entry)}
          onUnsaveEntry={(id) => lookups.unsavePopupEntry(id)}
          onSaveSelection={(entry, text) => void lookups.savePopupSelection(entry, text)}
          onEdit={lookups.startEditing}
          onEditWord={lookups.editPopupWord}
          ocr={popup.ocr}
          onMaximise={
            prefs.dictionaryFullPageEnabled
              ? () => {
                  openDictionaryPage({ word: popup.word, book });
                  lookups.closePopup();
                }
              : undefined
          }
        />
      )}

      {editing && (
        <VocabularyEditModal
          bookId={book.id}
          word={editing.word}
          alreadySaved={editing.saved}
          fallbackMeaning={editing.result?.entries[0]?.senses[0] ? senseText(editing.result.entries[0].senses[0]) : ''}
          fallbackSentence={editing.instance?.sentence}
          onCancel={lookups.cancelEditing}
          onSave={(patch) => lookups.saveEdit(patch).then(bumpSaved)}
        />
      )}

      {bubble && (
        <DictionaryBubble
          word={bubble.word}
          result={bubble.result}
          loading={bubble.loading}
          saved={bubble.saved}
          x={bubble.x}
          y={bubble.y}
          onOpenFull={lookups.expandBubble}
          onSave={() => void lookups.saveBubble()}
          onDismiss={lookups.closeBubble}
        />
      )}

      {lookups.quickAddToast && (
        <div className="reader__quick-add-toast" role="status">
          {lookups.quickAddToast}
        </div>
      )}
      {lookups.touchToast && (
        <div className="reader__quick-add-toast reader__touch-toast" role="status">
          <span>{lookups.touchToast.message}</span>
          {lookups.touchToast.undo && (
            <button className="reader__touch-toast-undo" onClick={() => void lookups.undoQuickSave()}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
