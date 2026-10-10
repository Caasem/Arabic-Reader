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
import type { BookMeta } from '../../types';
import { openPdfPages, type OpenedPdf, type PDFPageProxy } from './pdfjsLoader';
import { rememberCorrection } from '../ocr/corrections';
import { pdfPageExtensions, type PdfWordTap } from './extensions';
import { loadPdfPage, savePdfPage } from './pdfView';
import { wordAtPoint } from './wordAtPoint';
import { Header, ProgressRail, TurnButtons } from '../../quietReader/Chrome';
import { formatClock, remainingMs, usePomodoroSnapshot } from '../../quietReader/pomodoroClock';
import { TimerPopover } from '../../quietReader/TimerPopover';
import { useMarks } from '../../quietReader/useMarks';
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
}

/**
 * The original pages of a book added from a PDF, in the reader's frame (src/quietReader): its header, the shared
 * dock (src/readerTools), page turns at the sides, where you are, and the progress rail. Pages are fit-to-width in
 * a scrolling column, drawn a couple of pages ahead; Display or Ctrl+wheel zooms. Words are tapped through the
 * PDF's own text layer (or an extension, such as text recognition on a scanned page) and go to the same
 * dictionary popup as in the reader.
 */
export function PdfPagesReader({ book, onBack, onShowText, onOpenSettings, initialLocation }: Props) {
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
        if (sheet) setSheet(null);
        else lookups.closeAll();
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

  // --- Bookmarks: one per page ------------------------------------------------------------------------
  const percent = total ? (page - 1) / total : 0;
  const pct = Math.round(percent * 100);
  const pageBookmarks = marks.bookmarks.filter((b) => pageOfLocation(b.cfi) === page);
  const bookmarked = pageBookmarks.length > 0;
  async function toggleBookmark() {
    if (bookmarked) {
      for (const b of pageBookmarks) await marks.removeBookmark(b.id);
      return;
    }
    await marks.addBookmark({ location: `pdf:page=${page}`, percent, pageLabel: `Page ${page}`, chapterHref: `pdf:page=${page}`, chapterLabel: '' });
  }

  // --- The dock ---------------------------------------------------------------------------------------
  function onDock(id: ReadToolId) {
    if (id === 'display' || id === 'timer') {
      if (id === 'timer') setTimerX(dockButtonX(readToolId('timer'), frameRef.current));
      setSheet((s) => (s === id ? null : id));
    } else if (id === 'focus') {
      setSheet(null);
      lookups.closeAll();
      setReaderFocus(true);
    }
  }
  const timerLabel = snapshot ? formatClock(remainingMs(snapshot)) : null;
  useReadTools('pdf', {
    has: ['display', 'timer', 'focus'],
    isOn: (id) => sheet === id,
    run: onDock,
    timer: timerLabel,
    titles: { display: 'Zoom and display', focus: 'Focus: just the pages (Esc to leave)' },
  });

  const whereLabel = total ? `Page ${page} of ${total} · ${pct}%` : `Page ${page}`;
  useEffect(() => setFocusWhere(total ? `Page ${page} of ${total}` : `Page ${page}`), [page, total]);
  useEffect(() => () => setFocusWhere(''), []);
  useEffect(() => {
    if (focus) setSheet(null);
  }, [focus]);

  const dockCenter = frameW / 2;
  // Extensions' header controls (the text-recognition chip; the ink's page report) stay mounted in Focus, hidden.
  const extensionBar = opened && pdfPageExtensions().map((ext) => ext.Toolbar && <ext.Toolbar key={ext.id} book={book} page={page} total={total} opened={opened} />);

  return (
    <div ref={rootRef} className={`qr pdfp pdfp--${prefs.pdfPageTint}` + (narrow ? ' qr--narrow' : '') + (focus ? ' qr--focus' : '')}>
      {chrome ? (
        <Header
          bookTitle={book.title}
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

      <div className="pdfp__body" style={{ top: chrome ? HEADER_PX : 0 }}>
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

      <ProgressRail percent={percent} ticks={[]} />

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
          onSave={() => void lookups.togglePopupSave()}
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
          onSave={lookups.saveEdit}
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
