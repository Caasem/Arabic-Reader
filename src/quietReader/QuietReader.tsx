import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { openDictionaryPage } from '../dictionaryPage/events';
import { DictionaryBubble } from '../components/reader/DictionaryBubble';
import { DictionaryPopup } from '../components/reader/DictionaryPopup';
import { HoverPreview } from '../components/reader/HoverPreview';
import { VocabularyEditModal } from '../components/reader/VocabularyEditModal';
import { useHoverPreview } from '../components/reader/hooks/useHoverPreview';
import { useWordLookups } from '../components/reader/hooks/useWordLookups';
import { chapterHtml } from '../cleanReader/chapterHtml';
import { dockButtonX, ReaderDock, readToolId, setFocusWhere, setReaderFocus, useReaderFocus, useReadTools, type ReadToolId } from '../readerTools';
import { loadCleanPosition, saveCleanPosition } from '../cleanReader/cleanPosition';
import { elementAsDocument } from '../cleanReader/elementAsDocument';
import { parseCleanEpub } from '../cleanReader/parseCleanEpub';
import { useCleanSavedWords } from '../cleanReader/useCleanSavedWords';
import '../cleanReader/cleanReader.css';
import { logDiagnostic } from '../diagnostics/diagnosticsLog';
import { libraryService } from '../library/libraryService';
import { announceReaderSelection, registerBookNavigator, registerReaderMarks, sentenceSpan, type LocationHint } from '../readerChords';
import { ReadingSessionTracker } from '../reader/session';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import { attachSectionInteractions, createGestureState, type SectionInteractionHandlers, type WordTarget } from '../reader/wordInteraction/sectionInteractions';
import { distinctWordsIn, wrapArabicWords } from '../reader/wordInteraction/wrapWords';
import { usePreferences } from '../state/PreferencesContext';
import { SAVED_WORD_COLOR } from '../theme/tokens';
import type { BookMeta, Highlight, HighlightColor, VocabularyItem } from '../types';
import { vocabularyService } from '../vocabulary';
import { BookDrawer, type BookmarkRow, type ChapterRow, type DrawerTab, type HighlightRow } from './BookDrawer';
import { buildBookModel, type BookModel } from './bookModel';
import { Header, ProgressRail, TurnButtons } from './Chrome';
import { searchForms, searchTexts } from './cleanSearch';
import { normalizeForSearch } from '../reader/tokenizer/arabicTokenizer';
import { DisplaySheet } from './DisplaySheet';
import { chapterForEpubPosition, formatCleanLocation, parseCleanLocation } from './location';
import { MarginLevels } from './MarginLevels';
import { NotePopover, SelectionBar, type ViewportRect } from './Overlays';
import { clearPaint, flash, paintHighlights, paintSearchMatch, paintSupported } from './paint';
import { bookProgress, chapterStarts, estimatePages } from './progress';
import { useReaderView } from './readerView';
import { useReaderSearch, type SearchHit } from './searchState';
import { caretAt, offsetWithin, rangeAt } from './textOffsets';
import { formatClock, remainingMs, usePomodoroSnapshot } from './pomodoroClock';
import { TimerPopover } from './TimerPopover';
import { useMarks } from './useMarks';
import './quietReader.css';
import { senseText } from '../dictionary/senseText';

/** Text size at 100%; the font-size preference scales it. */
const BASE_FONT_PX = 22;
/** Between columns, and between one page and the next in Paged layout. */
const GAP = 64;
/** Side padding of `.qr-text` (quietReader.css). The CSS columns lie inside it, so it's part of the page step. */
const TEXT_PAD = 4;
const LEVELS_WIDTH = 372;
const DRAWER_WIDTH = 404;
const NARROW_PX = 760;
const SAVE_DEBOUNCE_MS = 300;

type Mode = 'paged' | 'scroll' | 'all';

/** Where to land once the chapter is laid out. */
interface Target {
  chapter: number;
  /** 0-1 into the chapter. */
  fraction?: number;
  /** A character offset to bring into view (and flash up to `end`). */
  offset?: number;
  end?: number;
  /** Paged: the chapter's last page. */
  last?: boolean;
}

interface Located {
  chapter: number;
  start: number;
  end: number;
}

interface Props {
  book: BookMeta;
  onBack(): void;
  /** Lets the app hide its own sidebar while the text fills the screen (Focus). */
  onFocusChromeChange?(hidden: boolean): void;
  /** A place to open at instead of the saved position: a clean location, or an epub CFI from the other reader. */
  initialLocation?: string;
  /** Opens another book at a place (Library search). */
  onOpenBookAt?(book: BookMeta, location?: string): void;
  /** The app's Vocab Levels tab opens the levels panel. */
  levelsOpen?: boolean;
  onLevelsOpenChange?(open: boolean): void;
  onOpenSettings?(group?: string): void;
  /** Display -> View -> Original layout. */
  onShowOriginal?(): void;
  /** A book added from a PDF: Display -> Original pages. */
  onShowPages?(): void;
}

const isTyping = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
const sectionOf = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.qr-chapter') ?? null;

/**
 * The redesigned reader: the book as clean text on a quiet page, one dock at
 * the bottom, vocab levels beside the text, the usual dictionary popup, and a
 * drawer for contents, search, marks and saved words.
 */
export function QuietReader({ book, onBack, onFocusChromeChange, initialLocation, onOpenBookAt, levelsOpen, onLevelsOpenChange, onOpenSettings, onShowOriginal, onShowPages }: Props) {
  const { prefs, resolvedTheme } = usePreferences();
  const prefsRef = useRef(prefs);
  useLayoutEffect(() => {
    prefsRef.current = prefs;
  });
  const [view, setView] = useReaderView(book.id);

  // --- The book and where we are in it ---------------------------------------------------------------
  const [model, setModel] = useState<BookModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const chapterRef = useRef(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [pages, setPages] = useState(1);
  const pagesRef = useRef(1);
  const [screens, setScreens] = useState(1);
  const [fraction, setFraction] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const [visible, setVisible] = useState<Located | null>(null);
  const pendingRef = useRef<Target | null>(null);
  const trackerRef = useRef<ReadingSessionTracker | null>(null);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const visibleTimerRef = useRef<number | undefined>(undefined);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const prepared = useRef(new WeakSet<Element>());
  const [size, setSize] = useState({ w: 1280, h: 800 });

  const mode: Mode = prefs.readingFlow === 'paginated' ? 'paged' : prefs.continuousScrollEnabled ? 'all' : 'scroll';
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await libraryService.getBookFile(book.id);
        if (!file) throw new Error('Could not read this book file.');
        const parsed = await parseCleanEpub(file);
        if (cancelled) return;
        const m = buildBookModel(parsed);
        const last = m.book.chapters.length - 1;
        const loc = parseCleanLocation(initialLocation);
        const epubChapter = !loc && initialLocation ? chapterForEpubPosition(m.book.chapters, initialLocation) : null;
        const saved = loadCleanPosition(book.id);
        const target: Target = loc
          ? { chapter: Math.min(loc.chapter, last), offset: loc.start, end: loc.end }
          : epubChapter !== null
            ? { chapter: epubChapter, fraction: 0 }
            : { chapter: Math.min(saved.chapter, last), fraction: saved.scroll };
        pendingRef.current = target;
        chapterRef.current = target.chapter;
        const tracker = new ReadingSessionTracker(book.id, book.title, bookProgress(m.chars, target.chapter, target.fraction ?? 0));
        tracker.start();
        trackerRef.current = tracker;
        setChapter(target.chapter);
        setModel(m);
      } catch (e) {
        if (cancelled) return;
        logDiagnostic('error', 'reader', `Could not open "${book.title}" in the reader`, e);
        setError(e instanceof Error ? e.message : 'Could not open this book.');
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(saveTimerRef.current);
      void trackerRef.current?.finish();
      trackerRef.current = null;
      clearPaint();
    };
    // The initial location only matters when the book first opens; later ones are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.title]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => setSize({ w: root.clientWidth, h: root.clientHeight }));
    observer.observe(root);
    setSize({ w: root.clientWidth, h: root.clientHeight });
    return () => observer.disconnect();
  }, []);

  // --- Panels -----------------------------------------------------------------------------------------
  // Focus is shared with the PDF pages (src/readerTools): one switch, one pill, one tool rail.
  const focus = useReaderFocus().on;
  const setFocus = setReaderFocus;
  const [levelsOwn, setLevelsOwn] = useState(false);
  const levels = levelsOpen ?? levelsOwn;
  const setLevels = useCallback((open: boolean) => (onLevelsOpenChange ? onLevelsOpenChange(open) : setLevelsOwn(open)), [onLevelsOpenChange]);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const [sheet, setSheet] = useState<'display' | 'timer' | null>(null);
  /** Where the Timer button is, so its sheet opens above it. */
  const [timerX, setTimerX] = useState<number | null>(null);
  const [selection, setSelection] = useState<(Located & { text: string; rect: ViewportRect }) | null>(null);
  const [note, setNote] = useState<{ chapter: number; index: number; rect: ViewportRect } | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<VocabularyItem[] | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const chrome = !focus;
  /** Something was saved or removed: lists of saved words reload. */
  const bumpSaved = useCallback(() => setSavedVersion((v) => v + 1), []);

  // --- Word lookups -----------------------------------------------------------------------------------
  const hover = useHoverPreview();
  const savedWords = useCleanSavedWords(book.id, articleRef);
  const lookups = useWordLookups({ book, trackerRef, savedWords, prefsRef, onLookupStart: hover.dismiss });
  const lookupsRef = useRef(lookups);
  useLayoutEffect(() => {
    lookupsRef.current = lookups;
  });
  const activeWordRef = useRef<HTMLElement | null>(null);
  const [gestureState] = useState(createGestureState);

  const marks = useMarks(book);
  const search = useReaderSearch({
    book,
    model,
    chapter,
    liveSearch: prefs.liveSearchEnabled,
    history: prefs.searchHistoryEnabled,
  });
  const snapshot = usePomodoroSnapshot();

  // --- Layout -----------------------------------------------------------------------------------------
  const narrow = size.w < NARROW_PX;
  const popup = lookups.popup;
  const padL = !narrow && levels ? LEVELS_WIDTH + 48 : 0;
  const padR = !narrow && drawer ? DRAWER_WIDTH : 0;
  const region = size.w - padL - padR;
  const twoColumns = mode === 'paged' && prefs.twoColumnEnabled;
  const baseWidth = 380 + 3.8 * prefs.readingWidthPct;
  const colW = Math.round(Math.max(260, Math.min(twoColumns ? baseWidth * 1.75 : baseWidth, region - (narrow ? 32 : 150))));
  // The distance between two pages: one column's inner width plus the gap. Using the outer width
  // here drifts the text out of its frame by the padding on every page turn.
  const step = colW - TEXT_PAD * 2 + GAP;
  const dockCenter = padL + region / 2;
  const labels = region >= 860;
  const stageTop = focus ? 84 : narrow ? 68 : 92;
  const stageBottom = focus ? 72 : narrow ? 120 : 118;
  const fontFamily = prefs.fontFamily;

  const htmls = useMemo(() => model?.book.chapters.map((c) => chapterHtml(c, { notes: true })) ?? [], [model]);
  const rendered = useMemo(() => (mode === 'all' ? htmls.map((_, i) => i) : model ? [chapter] : []), [mode, htmls, model, chapter]);

  const sectionEl = useCallback((index: number) => articleRef.current?.querySelector<HTMLElement>(`.qr-chapter[data-chapter="${index}"]`) ?? null, []);

  const setPageIdx = useCallback((p: number) => {
    pageRef.current = p;
    setPage(p);
  }, []);

  // --- Highlights, resolved to clean positions --------------------------------------------------------
  const located = useMemo(() => {
    const map = new Map<string, Located>();
    if (!model) return map;
    for (const h of marks.highlights) {
      const loc = parseCleanLocation(h.cfiRange);
      if (loc) {
        map.set(h.id, loc);
        continue;
      }
      // Made in the original layout: find its text in the matching chapter.
      const ch = chapterForEpubPosition(model.book.chapters, h.cfiRange, h.chapterHref);
      const chapters = ch !== null ? [ch] : undefined;
      const hit = searchTexts(model.texts, h.text, 'phrase', { chapters })[0];
      if (hit) map.set(h.id, { chapter: hit.chapter, start: hit.start, end: hit.end });
    }
    return map;
  }, [model, marks.highlights]);

  const repaint = useCallback(() => {
    const byColor = new Map<HighlightColor, Range[]>();
    for (const h of marks.highlights) {
      const loc = located.get(h.id);
      const section = loc && sectionEl(loc.chapter);
      if (!loc || !section || !prepared.current.has(section)) continue;
      const range = rangeAt(section, loc.start, loc.end);
      if (range) byColor.set(h.color, [...(byColor.get(h.color) ?? []), range]);
    }
    paintHighlights(byColor);
  }, [marks.highlights, located, sectionEl]);
  const repaintRef = useRef(repaint);
  repaintRef.current = repaint;

  /** Wraps a section's words (once) so they can be tapped, and counts its words as seen. */
  const prepare = useCallback(
    (section: HTMLElement) => {
      if (prepared.current.has(section)) return;
      prepared.current.add(section);
      wrapArabicWords(section);
      const href = `clean:${section.dataset.chapter}`;
      if (trackerRef.current?.isFirstVisit(href) ?? true) void vocabularyService.recordEncounters(book.id, distinctWordsIn(section), href);
    },
    [book.id]
  );

  // --- Measuring and landing --------------------------------------------------------------------------
  const countPages = useCallback(() => {
    const article = articleRef.current;
    if (!article) return 1;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim()) last = n;
    if (!last) return 1;
    const range = document.createRange();
    range.setStart(last, Math.max(0, (last.textContent?.length ?? 1) - 1));
    range.setEnd(last, last.textContent?.length ?? 0);
    const end = range.getBoundingClientRect();
    const box = article.getBoundingClientRect();
    return Math.max(1, Math.floor((box.right - end.right) / step) + 1);
  }, [step]);

  const pageOfOffset = useCallback(
    (section: HTMLElement, offset: number) => {
      const article = articleRef.current;
      const range = rangeAt(section, offset, offset + 1) ?? rangeAt(section, offset, offset);
      if (!article || !range) return 0;
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      const box = article.getBoundingClientRect();
      return Math.min(pagesRef.current - 1, Math.max(0, Math.floor((box.right - rect.right + 1) / step)));
    },
    [step]
  );

  const applyPending = useCallback(() => {
    const target = pendingRef.current;
    const stage = stageRef.current;
    if (!target || !stage) return;
    const section = sectionEl(target.chapter);
    if (!section) return;
    pendingRef.current = null;
    prepare(section);
    if (modeRef.current === 'paged') {
      let p = 0;
      if (target.offset !== undefined) p = pageOfOffset(section, target.offset);
      else if (target.last) p = pagesRef.current - 1;
      else if (target.fraction) p = Math.min(pagesRef.current - 1, Math.floor(target.fraction * pagesRef.current));
      setPageIdx(p);
    } else {
      const stageTopPx = stage.getBoundingClientRect().top;
      if (target.offset !== undefined) {
        const range = rangeAt(section, target.offset, target.offset + 1);
        const rect = range?.getBoundingClientRect();
        if (rect) stage.scrollTop += rect.top - stageTopPx - stage.clientHeight * 0.3;
      } else if (modeRef.current === 'all') {
        const rect = section.getBoundingClientRect();
        stage.scrollTop += rect.top - stageTopPx + (target.fraction ?? 0) * rect.height;
      } else {
        stage.scrollTop = (target.fraction ?? 0) * Math.max(0, stage.scrollHeight - stage.clientHeight);
      }
    }
    if (target.offset !== undefined && target.end !== undefined && target.end > target.offset) {
      const range = rangeAt(section, target.offset, target.end);
      if (range) flash(range);
    }
  }, [sectionEl, prepare, pageOfOffset, setPageIdx]);

  /** The text the reader can see right now, from the page's reading-start corner to its end corner. */
  const measureVisible = useCallback((): Located | null => {
    const stage = stageRef.current;
    const article = articleRef.current;
    if (!stage || !article || !model) return null;
    const s = stage.getBoundingClientRect();
    const a = article.getBoundingClientRect();
    const right = Math.min(s.right, mode === 'paged' ? a.right - pageRef.current * step : a.right) - 6;
    const leftX = Math.max(s.left, right - colW + 12);
    const at = (x: number, y: number) => {
      const caret = caretAt(x, y);
      const section = caret && article.contains(caret.node) ? sectionOf(caret.node) : null;
      return caret && section ? { chapter: Number(section.dataset.chapter), offset: offsetWithin(section, caret.node, caret.offset) } : null;
    };
    const start = at(right, s.top + 10) ?? { chapter: chapterRef.current, offset: 0 };
    const end = at(leftX, s.bottom - 10);
    const endOffset = end && end.chapter === start.chapter ? end.offset : (model.chars[start.chapter] ?? 0);
    const range = { chapter: start.chapter, start: start.offset, end: Math.max(start.offset, endOffset) };
    setVisible(range);
    return range;
  }, [model, mode, step, colW]);

  /** Progress, saved position and what's visible, after any move. */
  const settle = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !model) return;
    let frac = 0;
    if (modeRef.current === 'paged') {
      frac = pagesRef.current > 1 ? pageRef.current / pagesRef.current : 0;
      setAtEnd(true);
    } else if (modeRef.current === 'scroll') {
      const max = stage.scrollHeight - stage.clientHeight;
      frac = max > 0 ? Math.min(1, stage.scrollTop / max) : 0;
      setAtEnd(max <= 0 || stage.scrollTop >= max - 4);
      setScreens(Math.max(1, Math.round(stage.scrollHeight / Math.max(1, stage.clientHeight))));
    } else {
      const top = stage.getBoundingClientRect().top + 1;
      const sections = Array.from(stage.querySelectorAll<HTMLElement>('.qr-chapter'));
      const current = sections.filter((el) => el.getBoundingClientRect().top <= top).pop() ?? sections[0];
      if (current) {
        const rect = current.getBoundingClientRect();
        const index = Number(current.dataset.chapter);
        frac = Math.min(1, Math.max(0, (top - rect.top) / Math.max(1, rect.height)));
        if (index !== chapterRef.current) {
          chapterRef.current = index;
          setChapter(index);
        }
        setScreens(Math.max(1, Math.round(rect.height / Math.max(1, stage.clientHeight))));
      }
      const max = stage.scrollHeight - stage.clientHeight;
      setAtEnd(max <= 0 || stage.scrollTop >= max - 4);
    }
    setFraction(frac);
    const percent = bookProgress(model.chars, chapterRef.current, frac);
    trackerRef.current?.recordPercent(percent);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => saveCleanPosition(book.id, { chapter: chapterRef.current, scroll: frac }), SAVE_DEBOUNCE_MS);
    window.clearTimeout(visibleTimerRef.current);
    visibleTimerRef.current = window.setTimeout(measureVisible, 120);
  }, [model, book.id, measureVisible]);

  // After the text renders or its layout changes: prepare it, count pages, land, settle.
  const layoutKey = [mode, mode === 'all' ? 'all' : chapter, colW, prefs.fontSizePct, prefs.lineHeight, fontFamily, twoColumns, stageTop, stageBottom, size.h].join('|');
  useLayoutEffect(() => {
    if (!model) return;
    const article = articleRef.current;
    if (!article) return;
    if (mode !== 'all') article.querySelectorAll<HTMLElement>('.qr-chapter').forEach(prepare);
    savedWords.repaint();
    if (mode === 'paged') {
      const n = countPages();
      pagesRef.current = n;
      setPages(n);
      if (pageRef.current > n - 1) setPageIdx(n - 1);
    }
    applyPending();
    repaintRef.current();
    settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, layoutKey]);

  // Fonts can arrive after the first layout and change how many pages there are.
  useEffect(() => {
    if (!model || !('fonts' in document)) return;
    const relayout = () => {
      if (modeRef.current !== 'paged') return;
      const n = countPages();
      pagesRef.current = n;
      setPages(n);
      if (pageRef.current > n - 1) setPageIdx(n - 1);
    };
    document.fonts.addEventListener('loadingdone', relayout);
    void document.fonts.ready.then(relayout);
    return () => document.fonts.removeEventListener('loadingdone', relayout);
  }, [model, countPages, setPageIdx]);

  useEffect(() => {
    if (mode === 'paged' && model) settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  // Scroll all: sections are prepared as they come near the screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (mode !== 'all' || !model || !stage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!entry.isIntersecting || prepared.current.has(entry.target)) continue;
          prepare(entry.target as HTMLElement);
          changed = true;
        }
        if (changed) {
          savedWords.repaint();
          repaintRef.current();
        }
      },
      { root: stage, rootMargin: '150% 0px' }
    );
    stage.querySelectorAll('.qr-chapter').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [mode, model, htmls, prepare, savedWords]);

  // --- Moving -----------------------------------------------------------------------------------------
  const goTo = useCallback(
    (target: Target) => {
      if (!model) return;
      const clamped = { ...target, chapter: Math.max(0, Math.min(model.book.chapters.length - 1, target.chapter)) };
      pendingRef.current = clamped;
      lookupsRef.current.closeBubble();
      hover.dismiss();
      if (modeRef.current !== 'all' && clamped.chapter !== chapterRef.current) {
        chapterRef.current = clamped.chapter;
        setPageIdx(0);
        setChapter(clamped.chapter);
      } else {
        applyPending();
        if (modeRef.current !== 'paged') settle();
      }
    },
    [model, hover, setPageIdx, applyPending, settle]
  );

  const next = useCallback(() => {
    if (!model) return;
    const lastChapter = model.book.chapters.length - 1;
    if (modeRef.current === 'paged') {
      if (pageRef.current < pagesRef.current - 1) setPageIdx(pageRef.current + 1);
      else if (chapterRef.current < lastChapter) goTo({ chapter: chapterRef.current + 1, fraction: 0 });
    } else if (chapterRef.current < lastChapter) {
      goTo({ chapter: chapterRef.current + 1, fraction: 0 });
    }
    lookupsRef.current.closeBubble();
  }, [model, goTo, setPageIdx]);

  const prev = useCallback(() => {
    if (!model) return;
    if (modeRef.current === 'paged') {
      if (pageRef.current > 0) setPageIdx(pageRef.current - 1);
      else if (chapterRef.current > 0) goTo({ chapter: chapterRef.current - 1, last: true });
    } else if (modeRef.current === 'all' && fraction > 0.02) {
      goTo({ chapter: chapterRef.current, fraction: 0 });
    } else if (chapterRef.current > 0) {
      goTo({ chapter: chapterRef.current - 1, fraction: 0 });
    }
    lookupsRef.current.closeBubble();
  }, [model, goTo, setPageIdx, fraction]);

  /** Right-to-left (the default): the left side is "next". */
  const nextIsLeft = prefs.pageDirection !== 'ltr';
  const turn = useCallback((side: 'left' | 'right') => ((side === 'left') === nextIsLeft ? next() : prev()), [nextIsLeft, next, prev]);

  // A new place to open while this book is already open (e.g. a highlight opened from the Highlights tab).
  const lastInitial = useRef(initialLocation);
  useEffect(() => {
    if (!model || initialLocation === lastInitial.current) return;
    lastInitial.current = initialLocation;
    const loc = parseCleanLocation(initialLocation);
    if (loc) goTo({ chapter: loc.chapter, offset: loc.start, end: loc.end });
    else if (initialLocation) {
      const ch = chapterForEpubPosition(model.book.chapters, initialLocation);
      if (ch !== null) goTo({ chapter: ch, fraction: 0 });
    }
  }, [model, initialLocation, goTo]);

  // --- Finding places in the text ---------------------------------------------------------------------
  const findText = useCallback(
    (text: string, preferChapter?: number): Located | null => {
      if (!model || !text.trim()) return null;
      const inChapter = preferChapter !== undefined ? searchTexts(model.texts, text, 'phrase', { chapters: [preferChapter] })[0] : undefined;
      const hit = inChapter ?? searchTexts(model.texts, text, 'phrase')[0];
      return hit ? { chapter: hit.chapter, start: hit.start, end: hit.end } : null;
    },
    [model]
  );

  /** A saved word's place: where it was saved, else its sentence, else the word itself. */
  const locateWord = useCallback(
    (item: VocabularyItem): Located | null => {
      if (!model) return null;
      const saved = parseCleanLocation(item.chapterHref ?? item.location);
      if (saved && saved.end > saved.start) return saved;
      const ch = saved?.chapter ?? chapterForEpubPosition(model.book.chapters, item.location, item.chapterHref) ?? undefined;
      const sentence = item.sentence ? findText(item.sentence, ch) : null;
      if (sentence) {
        const within = searchForms([model.texts[sentence.chapter].slice(sentence.start, sentence.end)], new Set([normalize(item.surfaceForm)]))[0];
        return within ? { chapter: sentence.chapter, start: sentence.start + within.start, end: sentence.start + within.end } : sentence;
      }
      const word = searchForms(model.texts, new Set([normalize(item.surfaceForm)]), ch !== undefined ? [ch] : undefined)[0];
      return word ? { chapter: word.chapter, start: word.start, end: word.end } : null;
    },
    [model, findText]
  );

  const jumpTo = useCallback((loc: Located) => goTo({ chapter: loc.chapter, offset: loc.start, end: loc.end }), [goTo]);

  // Alt+S and Alt+V jump through readerChords, with an epub CFI or a clean place.
  useEffect(
    () =>
      registerBookNavigator((target: string, hint?: LocationHint) => {
        if (!model) return false;
        const loc = parseCleanLocation(target);
        if (loc) {
          if (loc.end > loc.start) jumpTo(loc);
          else {
            const found = hint?.text ? locateWord({ chapterHref: target, sentence: hint.sentence, surfaceForm: hint.text } as VocabularyItem) : null;
            if (found) jumpTo(found);
            else goTo({ chapter: loc.chapter, fraction: 0 });
          }
          return true;
        }
        const ch = chapterForEpubPosition(model.book.chapters, target, hint?.href);
        if (ch === null) return false;
        if (hint?.sentence && hint.text) {
          const found = locateWord({ chapterHref: hint.href, location: target, sentence: hint.sentence, surfaceForm: hint.text } as VocabularyItem);
          if (found) return void jumpTo(found);
        }
        if (hint?.text) {
          // Of several matches in the chapter, the one with the same text before it.
          const hits = searchTexts(model.texts, hint.text, 'phrase', { chapters: [ch] });
          const tail = normalizeForSearch((hint.before ?? '').replace(/^…/, '').slice(-24)).normalized.trim();
          const best =
            hits.find((h) => tail && normalizeForSearch(model.texts[ch].slice(Math.max(0, h.start - 80), h.start)).normalized.trim().endsWith(tail)) ?? hits[0];
          if (best) return void jumpTo(best);
        }
        goTo({ chapter: ch, fraction: 0 });
      }),
    [model, goTo, jumpTo, locateWord]
  );

  // Alt+N (note) and Alt+F (flashcard) read the selection and add highlights through readerChords.
  const selectionRef = useRef(selection);
  const marksRef = useRef(marks);
  const measureVisibleRef = useRef(measureVisible);
  const bumpSavedRef = useRef(bumpSaved);
  useEffect(() => {
    selectionRef.current = selection;
    marksRef.current = marks;
    measureVisibleRef.current = measureVisible;
    bumpSavedRef.current = bumpSaved;
  });
  useEffect(() => announceReaderSelection(), [selection]);
  useEffect(() => {
    if (!model) return;
    const titleOf = (chapter: number) => model.book.chapters[chapter]?.title ?? '';
    return registerReaderMarks({
      captureSelection() {
        const s = selectionRef.current;
        if (!s) return null;
        return {
          text: s.text,
          location: formatCleanLocation(s),
          chapterHref: `clean:${s.chapter}`,
          chapterLabel: titleOf(s.chapter),
          sentence: model.texts[s.chapter] ? model.texts[s.chapter].slice(sentenceSpan(model.texts[s.chapter], s.start).start, sentenceSpan(model.texts[s.chapter], s.end).end) : undefined,
        };
      },
      capturePage() {
        const v = measureVisibleRef.current();
        const text = v ? model.texts[v.chapter] : undefined;
        if (!v || !text) return null;
        const span = sentenceSpan(text, v.start);
        const start = Math.max(span.start, v.start);
        const end = span.end;
        if (end <= start) return null;
        const place = { chapter: v.chapter, start, end };
        return { text: text.slice(start, end), location: formatCleanLocation(place), chapterHref: `clean:${v.chapter}`, chapterLabel: titleOf(v.chapter), fromPage: true };
      },
      existing(c) {
        const h = marksRef.current.highlights.find((x) => x.cfiRange === c.location);
        return h ? { note: h.note ?? '' } : null;
      },
      async saveNote(c, note, color) {
        const m = marksRef.current;
        const found = m.highlights.find((x) => x.cfiRange === c.location);
        if (found) await m.setNote(found, note);
        else await m.addHighlight({ location: c.location, text: c.text, color, chapterHref: c.chapterHref, chapterLabel: c.chapterLabel, note });
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      },
      wordSaved(word) {
        savedWords.setSaved(word, true);
        bumpSavedRef.current();
      },
    });
  }, [model, savedWords]);

  // --- Word taps --------------------------------------------------------------------------------------
  const withLocation = useCallback((target: WordTarget): WordTarget => {
    const section = sectionOf(target.element);
    if (!section) return { ...target, sectionHref: `clean:${chapterRef.current}` };
    const chapterIndex = Number(section.dataset.chapter);
    const start = offsetWithin(section, target.element, 0);
    return { ...target, sectionHref: formatCleanLocation({ chapter: chapterIndex, start, end: start + target.word.length }) };
  }, []);

  const markActive = useCallback((el: HTMLElement | null) => {
    activeWordRef.current?.classList.remove('qr-word--active');
    activeWordRef.current = el;
    el?.classList.add('qr-word--active');
  }, []);

  useEffect(() => {
    if (!popup) markActive(null);
  }, [popup, markActive]);

  const handlersRef = useRef<SectionInteractionHandlers | null>(null);
  const [sectionHandlers] = useState<SectionInteractionHandlers>(() => {
    const current = () => handlersRef.current!;
    return {
      prefs: () => current().prefs(),
      pageDirection: () => current().pageDirection(),
      onWordClick: (t) => current().onWordClick(t),
      onTouchAction: (a, t) => current().onTouchAction(a, t),
      onBackgroundClick: () => current().onBackgroundClick(),
      onDoubleTap: () => current().onDoubleTap(),
      onHoverStart: (w, el) => current().onHoverStart(w, el),
      onHoverEnd: () => current().onHoverEnd(),
      onSwipe: (d) => current().onSwipe(d),
      onFootnoteClick: () => {},
      onActivity: () => current().onActivity(),
      onScrollEndChange: () => {},
      onKeyDown: () => {},
      onPointer: { down: () => {}, move: () => {}, up: () => {} },
    };
  });
  useLayoutEffect(() => {
    handlersRef.current = {
      // Swipes turn pages only where there's no scrolling to do it.
      prefs: () => ({ ...prefsRef.current, readingFlow: modeRef.current === 'paged' || focus ? 'paginated' : 'scrolled' }),
      pageDirection: () => (prefsRef.current.pageDirection === 'ltr' ? 'ltr' : 'rtl'),
      onWordClick: (target) => {
        markActive(target.element);
        void lookups.openPopup(withLocation(target));
      },
      onTouchAction: (action, target) => {
        if (action !== 'quickSave') markActive(target.element);
        lookups.runTouchAction(action, withLocation(target));
      },
      onBackgroundClick: () => lookups.closeBubble(),
      // The double tap's first tap already ran the single-tap action: close what it opened (the bubble, or on phones the popup).
      onDoubleTap: () => lookups.closeAll(),
      onHoverStart: hover.schedule,
      onHoverEnd: hover.dismiss,
      onSwipe: (direction) => (direction === 'next' ? next() : prev()),
      onFootnoteClick: () => {},
      onActivity: () => trackerRef.current?.recordActivity(),
      onScrollEndChange: () => {},
      onKeyDown: () => {},
      onPointer: { down: () => {}, move: () => {}, up: () => {} },
    };
  });

  useEffect(() => {
    const article = articleRef.current;
    if (article) attachSectionInteractions(elementAsDocument(article), 'clean', sectionHandlers, gestureState);
  }, [sectionHandlers, gestureState]);

  /** Looks up a word that isn't on the page (a dictionary search result): the popup opens mid-page. */
  const lookUpWord = useCallback(
    (word: string) => {
      const article = articleRef.current;
      const stage = stageRef.current;
      if (!article || !stage) return;
      const s = stage.getBoundingClientRect();
      const x = s.left + s.width / 2;
      const y = s.top + s.height / 3;
      void lookupsRef.current.openPopup({
        word,
        sectionHref: `clean:${chapterRef.current}`,
        element: article,
        rect: { top: y, bottom: y, left: x, right: x },
        x,
        y,
      });
    },
    []
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

  // --- Footnotes and selections -----------------------------------------------------------------------
  const onStageClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-note]');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      const section = sectionOf(button);
      if (!section) return;
      const r = button.getBoundingClientRect();
      setSelection(null);
      setNote({ chapter: Number(section.dataset.chapter), index: Number(button.dataset.note), rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
    },
    []
  );

  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    const article = articleRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !article) return setSelection(null);
    const range = sel.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer)) return setSelection(null);
    const section = sectionOf(range.startContainer);
    if (!section || section !== sectionOf(range.endContainer)) return setSelection(null);
    const text = sel.toString().trim();
    if (!text) return setSelection(null);
    const start = offsetWithin(section, range.startContainer, range.startOffset);
    const end = offsetWithin(section, range.endContainer, range.endOffset);
    const r = range.getBoundingClientRect();
    setSelection({ chapter: Number(section.dataset.chapter), start, end, text, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
  }, []);

  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelection(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  async function highlightSelection(color: HighlightColor, withNote = false) {
    const sel = selection;
    if (!sel || !model) return;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    const created = await marks.addHighlight({
      location: formatCleanLocation(sel),
      text: sel.text,
      color,
      chapterHref: `clean:${sel.chapter}`,
      chapterLabel: model.book.chapters[sel.chapter]?.title ?? '',
    });
    if (withNote) {
      setDrawer('marks');
      setEditingNote(created.id);
    }
  }

  // --- Keys -------------------------------------------------------------------------------------------
  const escapeRef = useRef<() => void>(() => {});
  escapeRef.current = () => {
    const l = lookupsRef.current;
    // As in the other readers, the dictionary popup closes with its × or a click outside it.
    if (l.editing || l.popup) return;
    if (selection) {
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    } else if (note) setNote(null);
    else if (sheet) setSheet(null);
    else if (l.bubble) l.closeBubble();
    else if (drawer) setDrawer(null);
    else if (levels) setLevels(false);
    else if (focus) setFocus(false);
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const nextRef = useRef(next);
  nextRef.current = next;
  const prevRef = useRef(prev);
  prevRef.current = prev;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      trackerRef.current?.recordActivity();
      // An Alt+S / Alt+D / Alt+V palette handles its own keys.
      if (e.defaultPrevented || (e.target as HTMLElement | null)?.closest?.('.bsearch, .bvocab, .dsearch, .fcard')) return;
      if (e.key === 'Escape') {
        escapeRef.current();
        return;
      }
      if (isTyping(e.target) || lookupsRef.current.editing) return;
      // Space with a word's dictionary open saves it instead of turning the page.
      if (lookupsRef.current.handleSpaceSave(e)) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (plain && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        turnRef.current(e.key === 'ArrowLeft' ? 'left' : 'right');
        return;
      }
      if (plain && modeRef.current === 'paged' && (e.key === 'PageDown' || e.key === ' ' || e.key === 'PageUp')) {
        e.preventDefault();
        if (e.key === 'PageUp') prevRef.current();
        else nextRef.current();
        return;
      }
      void lookupsRef.current.handleQuickAddKey(e);
    };
    const record = () => trackerRef.current?.recordActivity();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', record);
    window.addEventListener('click', record);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', record);
      window.removeEventListener('click', record);
    };
  }, []);


  // --- Focus ------------------------------------------------------------------------------------------
  useEffect(() => {
    onFocusChromeChange?.(focus);
  }, [focus, onFocusChromeChange]);
  useEffect(() => () => onFocusChromeChange?.(false), [onFocusChromeChange]);

  function enterFocus() {
    setSheet(null);
    setSelection(null);
    setNote(null);
    lookups.closeAll();
    setFocus(true);
  }

  function onDock(action: ReadToolId) {
    if (action === 'contents' || action === 'search' || action === 'marks' || action === 'words') setDrawer((d) => (d === action ? null : action));
    else if (action === 'display' || action === 'timer') {
      if (action === 'timer') setTimerX(dockButtonX(readToolId('timer'), rootRef.current));
      setSheet((s) => (s === action ? null : action));
    } else if (action === 'levels') setLevels(!levels);
    else enterFocus();
  }

  // --- Derived for display ----------------------------------------------------------------------------
  const chapters = model?.book.chapters ?? [];
  const chapterCount = chapters.length;
  const pageIndex = mode === 'paged' ? page : Math.min(screens - 1, Math.floor(fraction * screens));
  const pagesInChapter = mode === 'paged' ? pages : screens;
  const estimate = model ? estimatePages(model.chars, chapter, pagesInChapter, pageIndex) : null;
  const percent = model ? bookProgress(model.chars, chapter, mode === 'paged' ? (pages > 1 ? page / pages : 0) : fraction) : 0;
  const pct = Math.round(percent * 100);
  const whereLabel = !estimate
    ? ''
    : mode === 'paged'
      ? `Page ${estimate.current} of ${estimate.total} · ${pct}%`
      : `Chapter ${chapter + 1} of ${chapterCount} · ${pct}% of the book`;
  const hintLabel = mode === 'paged' ? `Chapter ${chapter + 1} of ${chapterCount}` : '← → change chapter';
  const nextLabel = mode === 'paged' ? 'Next page' : 'Next chapter';
  const prevLabel = mode === 'paged' ? 'Previous page' : 'Previous chapter';

  const bookmarkLocs = marks.bookmarks.map((b) => ({ bookmark: b, loc: parseCleanLocation(b.cfi) }));
  const onThisPage = (loc: Located | null) => !!loc && !!visible && loc.chapter === visible.chapter && loc.start >= visible.start && loc.start <= visible.end;
  const pageBookmarks = bookmarkLocs.filter(({ loc }) => onThisPage(loc));
  const bookmarked = pageBookmarks.length > 0;

  async function toggleBookmark() {
    if (!model) return;
    if (bookmarked) {
      for (const { bookmark } of pageBookmarks) await marks.removeBookmark(bookmark.id);
      return;
    }
    // Measured now, not from the last settle, so the new bookmark always counts as on this page.
    const at = measureVisible() ?? visible ?? { chapter, start: 0, end: 0 };
    await marks.addBookmark({
      location: formatCleanLocation({ chapter: at.chapter, start: at.start, end: at.start }),
      percent,
      pageLabel: estimate ? `Page ${estimate.current}` : `${pct}%`,
      chapterHref: `clean:${at.chapter}`,
      chapterLabel: chapters[at.chapter]?.title ?? '',
    });
  }

  const bookmarkRows: BookmarkRow[] = bookmarkLocs
    .map(({ bookmark, loc }) => {
      const ch = loc?.chapter ?? (model ? chapterForEpubPosition(model.book.chapters, bookmark.cfi, bookmark.chapterHref) : null);
      return { bookmark, loc, ch, order: (ch ?? 1e9) * 1e7 + (loc?.start ?? 0) };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ bookmark, loc, ch }) => ({
      id: bookmark.id,
      label: bookmark.chapterLabel || (ch !== null ? chapters[ch]?.title : '') || bookmark.bookTitle,
      where: `${bookmark.locationLabel}${onThisPage(loc) ? ' · this page' : ''}`,
      open: () => (loc ? goTo({ chapter: loc.chapter, offset: loc.start }) : ch !== null && goTo({ chapter: ch, fraction: 0 })),
      remove: () => void marks.removeBookmark(bookmark.id),
    }));

  const highlightRows: HighlightRow[] = marks.highlights
    .map((h: Highlight) => ({ h, loc: located.get(h.id) }))
    .sort((a, b) => (a.loc ? a.loc.chapter * 1e7 + a.loc.start : 1e15) - (b.loc ? b.loc.chapter * 1e7 + b.loc.start : 1e15))
    .map(({ h, loc }) => ({
      highlight: h,
      open: () => loc && jumpTo(loc),
      recolor: (color) => void marks.recolor(h, color),
      saveNote: (text) => void marks.setNote(h, text),
      remove: () => void marks.removeHighlight(h.id),
    }));

  const chapterRows: ChapterRow[] = chapters.map((c, i) => {
    const range = estimate?.ranges[i];
    return {
      title: c.title,
      meta:
        i === chapter
          ? `Reading now · page ${pageIndex + 1} of ${pagesInChapter}`
          : range
            ? range[0] === range[1]
              ? `Page ${range[0]}`
              : `Pages ${range[0]}–${range[1]}`
            : '',
      read: i < chapter ? 1 : i === chapter ? (mode === 'paged' ? (pages > 1 ? (page + 1) / pages : 1) : fraction) : 0,
      current: i === chapter,
      go: () => goTo({ chapter: i, fraction: 0 }),
    };
  });

  // The active search match, drawn while the Search tab is open.
  const activeHit = drawer === 'search' ? search.hits?.[search.active] : undefined;
  useEffect(() => {
    if (!activeHit || activeHit.chapter < 0 || activeHit.book.id !== book.id) return paintSearchMatch(null);
    const section = sectionEl(activeHit.chapter);
    paintSearchMatch(section && prepared.current.has(section) ? rangeAt(section, activeHit.start, activeHit.end) : null);
  }, [activeHit, book.id, sectionEl, chapter, page]);

  function pickHit(hit: SearchHit) {
    if (hit.chapter < 0) {
      if (hit.lookUp) lookUpWord(hit.lookUp);
      return;
    }
    if (hit.book.id !== book.id) {
      onOpenBookAt?.(hit.book, formatCleanLocation(hit));
      return;
    }
    jumpTo(hit);
    if (narrow) setDrawer(null);
  }

  const noteData = note && model ? model.book.chapters[note.chapter]?.notes?.[note.index] : undefined;
  const noteTarget = noteData?.text ? findText(noteData.text.slice(0, 40).trim()) : null;
  const timerLabel = snapshot ? formatClock(remainingMs(snapshot)) : null;
  const savedColor = SAVED_WORD_COLOR[resolvedTheme === 'dark' ? 'dark' : 'light'];
  const dockActive = new Set<ReadToolId>();
  if (drawer) dockActive.add(drawer);
  if (sheet) dockActive.add(sheet);
  if (levels) dockActive.add('levels');

  // The dock's reading tools are in the shared list (src/readerTools), so the PDF pages have the same dock and the
  // Focus rail has them too; the pill says where the reader is.
  useReadTools('clean', {
    has: ['contents', 'search', 'marks', 'words', 'display', 'levels', 'timer', 'focus'],
    isOn: (id) => dockActive.has(id),
    run: onDock,
    timer: timerLabel,
  });
  useEffect(() => setFocusWhere(whereLabel), [whereLabel]);

  const articleStyle = {
    width: colW,
    fontFamily,
    fontSize: `${(BASE_FONT_PX * prefs.fontSizePct) / 100}px`,
    lineHeight: prefs.lineHeight,
    '--saved-word-color': savedColor,
    ...(mode === 'paged'
      ? { height: '100%', columnCount: twoColumns ? 2 : 1, columnGap: GAP, columnFill: 'auto', transform: `translateX(${page * step}px)` }
      : {}),
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={'qr' + (narrow ? ' qr--narrow' : '') + (focus ? ' qr--focus' : '')}
      style={{ '--saved-word-color': savedColor } as CSSProperties}
    >
      {chrome && (
        <Header
          bookTitle={model?.book.title || book.title}
          chapterTitle={chapters[chapter]?.title}
          bookmarked={bookmarked}
          onBack={onBack}
          onToggleBookmark={() => void toggleBookmark()}
          onOpenSettings={() => onOpenSettings?.()}
        />
      )}

      <div
        ref={stageRef}
        className={'qr-stage qr-stage--' + mode}
        style={{ top: stageTop, bottom: stageBottom, left: padL, right: padR }}
        tabIndex={-1}
        onScroll={mode === 'paged' ? undefined : () => {
          settle();
          hover.dismiss();
        }}
        onClickCapture={onStageClickCapture}
        onPointerUp={() => window.setTimeout(readSelection, 0)}
        onKeyUp={(e) => e.shiftKey && readSelection()}
      >
        {error && <div className="qr-message">{error}</div>}
        {!model && !error && <div className="qr-message">Opening book…</div>}
        <div className="qr-column" style={{ width: colW }}>
          <article ref={articleRef} className="qr-text" dir="rtl" lang="ar" style={articleStyle}>
            {rendered.map((i) => (
              <section key={`${mode}:${i}`} className="qr-chapter" data-chapter={i} dangerouslySetInnerHTML={{ __html: htmls[i] }} />
            ))}
          </article>
        </div>
      </div>

      {prefs.showPageBoundaries && atEnd && model && (
        <div className="qr-end-marker" style={{ bottom: stageBottom - 22, left: padL + region / 2 }} aria-hidden="true">
          <span />
          End of page
          <span />
        </div>
      )}

      {chrome && !narrow && model && (
        <TurnButtons
          leftLabel={nextIsLeft ? nextLabel : prevLabel}
          rightLabel={nextIsLeft ? prevLabel : nextLabel}
          leftX={padL + 28}
          rightX={padR + 28}
          onLeft={() => turn('left')}
          onRight={() => turn('right')}
        />
      )}

      {chrome && model && (
        <>
          <div className="qr-where qr-where--right" style={{ right: padR + 28 }}>
            {whereLabel}
          </div>
          {!narrow && (
            <div className="qr-where qr-where--left" style={{ left: padL + 28 }}>
              {hintLabel}
            </div>
          )}
          <ReaderDock reader="clean" center={dockCenter} roomy={labels} />
        </>
      )}

      <ProgressRail percent={percent} ticks={model ? chapterStarts(model.chars) : []} />

      {sheet === 'display' && (
        <DisplaySheet
          center={dockCenter}
          view={view}
          onSetView={(v) => {
            setView(v);
            if (v === 'original') onShowOriginal?.();
          }}
          onOpenSettings={() => onOpenSettings?.('reading')}
          onShowPages={onShowPages}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'timer' && <TimerPopover book={book} center={timerX ?? dockCenter} onClose={() => setSheet(null)} />}

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
          onSaveEntry={(entry) => lookups.savePopupEntry(entry).then((id) => (bumpSaved(), id))}
          onUnsaveEntry={(id) => lookups.unsavePopupEntry(id).then(bumpSaved)}
          onSaveSelection={(entry, text) => void lookups.savePopupSelection(entry, text).then(bumpSaved)}
          onSaveEntries={(entries) => void lookups.savePopupEntries(entries).then(bumpSaved)}
          onEdit={lookups.startEditing}
          onEditWord={lookups.editPopupWord}
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
      {levels && model && (
        <MarginLevels book={book} model={model} savedItems={savedItems ?? []} onJump={(_, occ) => jumpTo(occ)} onClose={() => setLevels(false)} />
      )}

      {drawer && model && (
        <BookDrawer
          bookTitle={model.book.title || book.title}
          author={book.author}
          tab={drawer}
          onTab={setDrawer}
          onClose={() => setDrawer(null)}
          contents={{ pageLabel: estimate ? `Page ${estimate.current} of ${estimate.total}` : '', percent, chapters: chapterRows }}
          search={search}
          onPickHit={pickHit}
          marks={{
            bookmarked,
            onToggleBookmark: () => void toggleBookmark(),
            bookmarks: bookmarkRows,
            highlights: highlightRows,
            editing: editingNote,
            setEditing: setEditingNote,
            highlightsNote: paintSupported ? undefined : 'Highlights need iOS 17.2 or newer to show on the page. They are saved and listed here.',
          }}
          words={{
            items: savedItems,
            onJump: (item) => {
              const loc = locateWord(item);
              if (loc) jumpTo(loc);
              if (narrow) setDrawer(null);
            },
          }}
        />
      )}

      {selection && <SelectionBar anchor={selection.rect} onPick={(c) => void highlightSelection(c)} onNote={() => void highlightSelection('yellow', true)} />}
      {note && noteData && (
        <NotePopover
          anchor={note.rect}
          number={noteData.label}
          text={noteData.text}
          onGo={
            noteTarget
              ? () => {
                  setNote(null);
                  jumpTo(noteTarget);
                }
              : undefined
          }
          onClose={() => setNote(null)}
        />
      )}

      {lookups.editing && (
        <VocabularyEditModal
          bookId={book.id}
          word={lookups.editing.word}
          alreadySaved={lookups.editing.saved}
          fallbackMeaning={(lookups.editing.result?.entries[0]?.senses[0] ? senseText(lookups.editing.result.entries[0].senses[0]) : '')}
          fallbackSentence={lookups.editing.instance?.sentence}
          onCancel={lookups.cancelEditing}
          onSave={(patch) => lookups.saveEdit(patch).then(bumpSaved)}
        />
      )}

      {lookups.bubble && (
        <DictionaryBubble
          word={lookups.bubble.word}
          result={lookups.bubble.result}
          loading={lookups.bubble.loading}
          saved={lookups.bubble.saved}
          x={lookups.bubble.x}
          y={lookups.bubble.y}
          onOpenFull={lookups.expandBubble}
          onSave={() => void lookups.saveBubble()}
          onDismiss={lookups.closeBubble}
        />
      )}

      {hover.preview && <HoverPreview gloss={hover.preview.gloss} x={hover.preview.x} y={hover.preview.y} />}

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
