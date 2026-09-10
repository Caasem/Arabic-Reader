import { useEffect, useRef, useState } from 'react';
import { EpubService, type SearchResult, type RelocatedLocation } from '../../reader/epub/EpubService';

type SearchScope = 'page' | 'book' | 'library';
type SearchMode = 'phrase' | 'word';
/** A SearchResult, plus which book it came from -- only meaningful for
 * `searchScope === 'library'` results, where that isn't necessarily the
 * book currently open. */
type AnySearchResult = SearchResult & { book: BookMeta };
import { bookmarkService } from '../../reader/bookmarks/bookmarkService';
import { wrapArabicWords, distinctWordsIn } from '../../reader/wordInteraction/wrapWords';
import { extractSentence } from '../../reader/wordInteraction/extractSentence';
import { dictionaryManager } from '../../dictionary/DictionaryManager';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { annotationService } from '../../reader/annotations/annotationService';
import { persistenceService } from '../../persistence/db';
import { libraryService } from '../../library/libraryService';
import type {
  BookMeta,
  Bookmark,
  DictionaryEntry,
  DictionaryLookupResult,
  HighlightColor,
  TocItem,
  TouchDictionaryAction,
  VocabularyItem,
  WordInstance,
} from '../../types';
import { DictionaryPopup } from './DictionaryPopup';
import { DictionaryBubble } from './DictionaryBubble';
import { FootnotePopup } from './FootnotePopup';
import { HoverPreview } from './HoverPreview';
import { VocabLevels } from './VocabLevels';
import { SelectionToolbar } from './SelectionToolbar';
import { QuickSettingsPopover } from './QuickSettingsPopover';
import { VocabularyEditModal } from './VocabularyEditModal';
import type { Book } from 'epubjs';
import { usePreferences } from '../../state/PreferencesContext';
import { isFootnoteLink } from '../../reader/footnotes/resolveFootnote';
import { ReadingSessionTracker } from '../../reader/session/ReadingSessionTracker';
import { IconBack, IconContents, IconFocus, IconSearch, IconBookmark, IconBookmarkFilled, IconTrash, IconClose } from '../shared/icons';
import './Reader.css';

/** Hover-intent delay before the condensed preview appears — long enough
 * that a mouse just passing over text on its way somewhere else doesn't
 * flash a preview for every word it crosses. */
const HOVER_PREVIEW_DELAY_MS = 200;
const HOVER_PREVIEW_MAX_CHARS = 42;

/** How long the pointer has to sit still before Focus mode fades the
 * topbar out — matches the "controls fade on stillness" behavior from the
 * Midnight Study concept. */
const FOCUS_IDLE_MS = 2200;

// Saved-vocabulary occurrences get a font-colour-only treatment (no
// background, no underline) -- reuses the app's own existing muted-red
// token (--danger in index.css) rather than inventing a new colour, just
// slightly dimmed for the dark theme so it stays recognisable without
// glowing against a dark background. Can't reference `var(--danger)`
// directly: this stylesheet gets injected into each section's own iframe
// document, which is a separate cascade from the host page's :root.
const SAVED_WORD_COLOR = { light: '#a8483a', dark: '#c47e70' };

function wordStyle(isDark: boolean): string {
  return `
  /* manipulation (not just on .ar-word) so a real touchscreen's native
   * double-tap-to-zoom / pinch-zoom gesture recognizer never engages over
   * the reading surface at all -- without this, two quick taps landing
   * close together (e.g. this app's own double-tap gesture, or just a
   * reader tapping twice near the same word) can be mistaken for a
   * double-tap-zoom, which resizes the visual viewport and makes epub.js
   * re-layout/re-render the current page out from under the gesture. */
  html, body { touch-action: manipulation; }
  .ar-word { cursor: pointer; border-radius: 3px; transition: background 0.1s ease; touch-action: manipulation; }
  .ar-word:hover { background: rgba(156, 122, 79, 0.18); }
  .ar-word--saved { color: ${isDark ? SAVED_WORD_COLOR.dark : SAVED_WORD_COLOR.light}; }
  .ar-word--jump-flash { background: rgba(230, 170, 60, 0.55) !important; }
`;
}

/** How long to wait for a possible second tap on the *same* word before
 * treating a touchend as a plain single tap. Deliberately does NOT delay
 * the single-tap action itself — see the touchend handler below; this only
 * gates whether a later tap counts as "double". */
const DOUBLE_TAP_WINDOW_MS = 350;
/** How long a touch has to stay down, without moving, before it counts as
 * a hold (long-press). */
const TOUCH_HOLD_MS = 500;
/** Finger movement past this distance cancels tap/hold handling entirely
 * and hands the touch back to native browser behavior (scrolling, or
 * extending a text selection for highlighting). */
const TOUCH_MOVE_CANCEL_PX = 10;
/** Minimum horizontal travel before a touch counts as a page-turn swipe --
 * deliberately much larger than TOUCH_MOVE_CANCEL_PX above (which only
 * distinguishes "held still" from "moved at all", for word tap/hold) so an
 * accidental page turn doesn't fire during, say, a slightly wobbly
 * drag-to-select. Also requires the gesture to be predominantly
 * horizontal (see SWIPE_MAX_VERTICAL_RATIO) so it doesn't compete with
 * vertical scrolling in Scrolling layout. */
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_VERTICAL_RATIO = 0.5;

interface PopupState {
  word: string;
  x: number;
  y: number;
  result: DictionaryLookupResult | null;
  instance: WordInstance | null;
  saved: boolean;
  loading: boolean;
}

interface SelectionState {
  cfiRange: string;
  text: string;
  x: number;
  y: number;
}

interface FootnoteState {
  href: string;
  sectionHref: string;
  x: number;
  y: number;
  loading: boolean;
  html: string | null;
  failed: boolean;
}

interface HoverPreviewState {
  word: string;
  x: number;
  y: number;
  gloss: string | null;
}

export function Reader({
  book,
  onBack,
  vocabPanelOpen = false,
  onVocabPanelOpenChange,
  onFocusChromeChange,
  initialCfiOverride,
  onOpenBookAt,
}: {
  book: BookMeta;
  onBack: () => void;
  /** Whether the Vocabulary Levels split panel is shown at all — driven by
   * the "Vocab Levels" nav tab (see App.tsx). Independent from the panel's
   * own collapse/expand strip, which is purely local UI state. */
  vocabPanelOpen?: boolean;
  onVocabPanelOpenChange?: (open: boolean) => void;
  /** Fires whenever Focus mode's idle state changes, so App.tsx can fade
   * the app-level sidebar out too -- Reader has no way to reach that on its
   * own, since NavBar is a sibling rendered outside Reader entirely. */
  onFocusChromeChange?: (hidden: boolean) => void;
  /** Opens this book at a specific CFI instead of its own saved
   * ReadingPosition -- set by App.tsx when the reader arrived here via a
   * library-wide search result rather than the normal Library tap. */
  initialCfiOverride?: string;
  /** Switches the active book (optionally to a specific location) --
   * needed for library-wide search results that point at a *different*
   * book than the one currently open, which Reader can't do on its own
   * since book-switching is App.tsx's state, not Reader's. */
  onOpenBookAt?: (book: BookMeta, cfi?: string) => void;
}) {
  const { prefs } = usePreferences();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<EpubService | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const currentLocationRef = useRef<RelocatedLocation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [searchScope, setSearchScope] = useState<SearchScope>('book');
  const [searchMode, setSearchMode] = useState<SearchMode>('phrase');
  const liveSearchTimerRef = useRef<number | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [chapterLabel, setChapterLabel] = useState<string | undefined>();
  const [percent, setPercent] = useState(0);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [editingWord, setEditingWord] = useState<PopupState | null>(null);
  const [bubble, setBubble] = useState<PopupState | null>(null);
  const [footnote, setFootnote] = useState<FootnoteState | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookHandle, setBookHandle] = useState<Book | null>(null);
  const [vocabPanelCollapsed, setVocabPanelCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [topbarIdle, setTopbarIdle] = useState(false);
  // Separate from topbarIdle -- see the focus-mode effect below. The
  // sidebar only reappears via a deliberate left-edge drag, never from a
  // plain tap/scroll the way the topbar/footer do, so it needs its own
  // "revealed right now" flag rather than sharing topbarIdle's.
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const focusIdleTimerRef = useRef<number | null>(null);
  // Always points at the *current* scheduleIdle closure (see the focus-mode
  // effect below) so listeners attached inside each rendered epub.js iframe
  // -- which only get set up once per section, not once per render -- can
  // still reset the idle timer without going stale.
  const scheduleIdleRef = useRef<() => void>(() => {});
  // Same staleness problem as scheduleIdleRef, for the left-edge-drag
  // gesture's pointerdown/move/up handlers.
  const edgePointerDownRef = useRef<(e: PointerEvent) => void>(() => {});
  const edgePointerMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const edgePointerUpRef = useRef<() => void>(() => {});
  const [quickAddToast, setQuickAddToast] = useState<string | null>(null);
  const [touchToast, setTouchToast] = useState<{ message: string; undoItemId: string | null } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const hoverTokenRef = useRef(0);
  // Mirrors `popup` but never cleared when the popup itself is closed —
  // the quick-add shortcut (Ctrl+Shift+A) needs to know what the most
  // recently looked-up word resolved to even after its popup is dismissed.
  const lastLookupRef = useRef<PopupState | null>(null);
  const quickAddToastTimeoutRef = useRef<number | null>(null);
  const touchToastTimeoutRef = useRef<number | null>(null);
  // Invalidates an in-flight bubble lookup if a newer tap superseded it
  // before the dictionary/vocabulary lookups resolved — same pattern as
  // hoverTokenRef above.
  const bubbleTokenRef = useRef(0);
  // Touch-gesture bookkeeping (see the touchstart/touchmove/touchend
  // listeners inside svc.onRendered below). Kept as refs, not state — none
  // of this needs to trigger a re-render, and it must persist across
  // separate rendered sections (a section per epub.js page/chapter).
  const touchStartRef = useRef<{ x: number; y: number; word: string; el: HTMLElement } | null>(null);
  // Independent of touchStartRef above -- that one only engages for
  // touches starting on a word (see its own touchstart handler); a
  // page-turn swipe needs to work starting from anywhere on the page, so
  // it tracks every touch itself rather than piggybacking on that system.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchHoldTimerRef = useRef<number | null>(null);
  const touchHoldFiredRef = useRef(false);
  const touchSuppressContextMenuRef = useRef(false);
  const lastTapRef = useRef<{ word: string; time: number } | null>(null);
  // The Dashboard's data source — one tracker per book per mount, started
  // once the book's saved position is known and stopped (persisting a
  // ReadingSession row) when the Reader unmounts or switches books. See
  // ReadingSessionTracker for what it actually measures.
  const sessionTrackerRef = useRef<ReadingSessionTracker | null>(null);

  useEffect(() => {
    let cancelled = false;
    const svc = new EpubService();
    serviceRef.current = svc;

    (async () => {
      try {
        const file = await libraryService.getBookFile(book.id);
        if (!file || !containerRef.current) throw new Error('Could not read this book file.');
        const savedPos = await persistenceService.getReadingPosition(book.id);
        await svc.open(file, containerRef.current, initialCfiOverride ?? savedPos?.cfi, prefsRef.current);
        if (cancelled) return;

        setToc(svc.getToc());
        setChapterLabel(savedPos?.chapterLabel);
        setPercent(savedPos?.percent ?? 0);
        setReady(true);
        setBookHandle(svc.getBookHandle());

        sessionTrackerRef.current = new ReadingSessionTracker(book.id, book.title, savedPos?.percent ?? 0);
        sessionTrackerRef.current.start();

        bookmarkService.listForBook(book.id).then(setBookmarks);

        // Real page numbers for bookmarks (see EpubService.getPageLabel):
        // restore a previously-generated locations index if this book has
        // one cached, otherwise generate it now, in the background, well
        // after the book is already showing -- never blocks reading, and
        // the (slow, full-book-text) generation only ever happens once per
        // book since the result gets cached for next time.
        persistenceService.getBookLocations(book.id).then(async (cached) => {
          if (cancelled) return;
          if (cached) {
            svc.loadLocations(cached.data);
            return;
          }
          const total = await svc.generateLocations();
          if (cancelled) return;
          const serialized = svc.serializeLocations();
          if (serialized) await persistenceService.saveBookLocations(book.id, serialized, total);
        });

        // Re-apply any highlights saved on a previous visit. epub.js queues
        // these and renders them as their section comes into view, so it's
        // safe to register them all up front rather than per-section.
        annotationService.listForBook(book.id).then((highlights) => {
          highlights.forEach((h) => svc.renderHighlight(h.cfiRange, h.color));
        });

        svc.onRelocated((loc) => {
          dismissHoverPreview();
          setChapterLabel(loc.chapterLabel);
          setPercent(loc.percent);
          currentLocationRef.current = loc;
          sessionTrackerRef.current?.recordPercent(loc.percent);
          persistenceService.saveReadingPosition({
            bookId: book.id,
            cfi: loc.cfi,
            percent: loc.percent,
            chapterHref: loc.chapterHref,
            chapterLabel: loc.chapterLabel,
            updatedAt: Date.now(),
          });
        });

        svc.onRendered((doc, sectionHref) => {
          let style = doc.getElementById('ar-word-style') as HTMLStyleElement | null;
          if (!style) {
            style = doc.createElement('style');
            style.id = 'ar-word-style';
            doc.head.appendChild(style);
          }
          // Re-set every render (not just on first creation) so a theme
          // switch is reflected the next time this section re-renders, not
          // just on sections that haven't been seen yet.
          style.textContent = wordStyle(document.documentElement.dataset.theme === 'dark');
          wrapArabicWords(doc);

          // Dashboard word-count contribution for this section (see
          // ReadingSessionTracker — each section only counts once per
          // session, so scrolling back over it or a resize re-render
          // doesn't inflate the total).
          sessionTrackerRef.current?.recordSectionWords(sectionHref, doc.querySelectorAll('.ar-word').length);

          // Reading-activity signal for the idle cutoff (see
          // ReadingSessionTracker) — page turns and word taps already
          // count via onRelocated/the lookup paths below, this covers
          // plain scrolling/reading-in-place inside the iframe.
          doc.addEventListener('scroll', () => sessionTrackerRef.current?.recordActivity(), { passive: true });
          doc.addEventListener('touchmove', () => sessionTrackerRef.current?.recordActivity(), { passive: true });
          doc.addEventListener('keydown', () => sessionTrackerRef.current?.recordActivity());

          // Focus mode's edge-drag-to-reveal-sidebar listeners
          // (edgePointer*Ref above) live on the *host* window, which never
          // sees events dispatched inside this iframe's own separate
          // document -- an edge-drag starting on the actual book text needs
          // these forwarded to still reach them.
          //
          // Deliberately *not* forwarding 'click' here the same way: that
          // used to reveal the topbar/footer on a tap anywhere in the book
          // text, including blank space between lines with nothing to tap
          // on. The page's real margin -- the .reader__epub padding this
          // iframe sits inside -- is host-document space the window 'click'
          // listener below already covers, so tapping *that* still reveals
          // the chrome; a tap on empty space within the page itself no
          // longer does.
          doc.addEventListener('pointerdown', (e) => edgePointerDownRef.current(e));
          doc.addEventListener('pointermove', (e) => edgePointerMoveRef.current(e));
          doc.addEventListener('pointerup', () => edgePointerUpRef.current());
          doc.addEventListener('pointercancel', () => edgePointerUpRef.current());

          // Both of these used to run once *per distinct word* in the
          // section (recordEncounter: a get+put pair; the saved check: a
          // whole-vocabulary-table scan plus its own querySelectorAll) —
          // a section can easily have a few hundred distinct words, so
          // that was hundreds of concurrent IndexedDB transactions and DOM
          // queries firing on every single page turn or scroll, which is a
          // real source of reading jank. Batched here into one write and
          // one read, each covering the whole section at once, plus a
          // single DOM pass instead of one query per saved word.
          const words = distinctWordsIn(doc);
          vocabularyService.recordEncounters(book.id, words, sectionHref);
          vocabularyService.listForBook(book.id).then((items) => {
            if (items.length === 0) return;
            const saved = new Set(items.map((i) => i.surfaceForm));
            doc.querySelectorAll<HTMLElement>('.ar-word').forEach((el) => {
              if (el.dataset.word && saved.has(el.dataset.word)) el.classList.add('ar-word--saved');
            });
          });

          doc.body.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.ar-word') as HTMLElement | null;
            if (!target) {
              // Tapped/clicked reading content that isn't a word -- with
              // the bubble's own backdrop now click-through (see
              // DictionaryBubble.css), this is what actually dismisses an
              // open bubble on a tap elsewhere in the page. A no-op if
              // there isn't one open.
              setBubble(null);
              return;
            }
            const word = target.dataset.word;
            if (!word) return;
            const iframeEl = doc.defaultView?.frameElement as HTMLIFrameElement | undefined;
            const iframeRect = iframeEl?.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const x = (iframeRect?.left ?? 0) + targetRect.left + targetRect.width / 2;
            const y = (iframeRect?.top ?? 0) + targetRect.top;
            const sentence = prefsRef.current.sentenceContextEnabled ? extractSentence(target) ?? undefined : undefined;
            handleWordClick(word, sectionHref, x, y, sentence);
          });

          // Quick-add shortcut (opt-in — see Settings): saves the most
          // recently looked-up word straight to vocabulary without needing
          // the popup open or its "+ Add" button clicked. Attached inside
          // the iframe document too, not just the host window, since focus
          // is inside the iframe whenever a word was just clicked — a
          // window-level-only listener would miss the very case this
          // shortcut exists for (see the window-level twin below for when
          // focus is on the host page, e.g. right after closing a popup).
          doc.addEventListener('keydown', handleQuickAddKeydown);

          // Condensed translation-on-hover — opt-in (see Settings), so this
          // stays a no-op unless the preference is on. Reads prefsRef rather
          // than closing over `prefs` directly since this listener is
          // attached once per rendered section and shouldn't need to be
          // re-attached just because the toggle flips mid-read.
          doc.body.addEventListener('mouseover', (e) => {
            if (!prefsRef.current.hoverPreviewEnabled) return;
            const target = (e.target as HTMLElement).closest('.ar-word') as HTMLElement | null;
            if (!target) return;
            const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
            if (related && target.contains(related)) return; // moved between child nodes of the same word
            const word = target.dataset.word;
            if (!word) return;

            if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
            const token = ++hoverTokenRef.current;
            hoverTimeoutRef.current = window.setTimeout(() => {
              const iframeEl = doc.defaultView?.frameElement as HTMLIFrameElement | undefined;
              const iframeRect = iframeEl?.getBoundingClientRect();
              const targetRect = target.getBoundingClientRect();
              const x = (iframeRect?.left ?? 0) + targetRect.left + targetRect.width / 2;
              const y = (iframeRect?.top ?? 0) + targetRect.top;
              handleWordHover(word, token, x, y);
            }, HOVER_PREVIEW_DELAY_MS);
          });

          doc.body.addEventListener('mouseout', (e) => {
            const target = (e.target as HTMLElement).closest('.ar-word') as HTMLElement | null;
            if (!target) return;
            const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
            if (related && target.contains(related)) return;
            dismissHoverPreview();
          });

          // Touch gestures for the dictionary bubble / quick-save / hold
          // shortcut (see Settings → Touch gestures). Deliberately never
          // calls preventDefault on touchstart/touchmove — that would break
          // page scrolling (Scrolling layout) and multi-word drag-to-select
          // (for highlighting), both of which rely on the browser's own
          // native touch handling running uninterrupted. Instead this only
          // decides, once a touch on a word *ends* without having moved,
          // whether to swallow the synthetic click that would otherwise
          // follow — when the resolved gesture is "none", nothing is
          // swallowed and the plain click listener above runs exactly as it
          // did before this feature existed (full popup, mouse or touch).
          function computeWordXY(target: HTMLElement) {
            const iframeEl = doc.defaultView?.frameElement as HTMLIFrameElement | undefined;
            const iframeRect = iframeEl?.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            return {
              x: (iframeRect?.left ?? 0) + targetRect.left + targetRect.width / 2,
              y: (iframeRect?.top ?? 0) + targetRect.top,
            };
          }

          doc.body.addEventListener(
            'touchstart',
            (e) => {
              touchHoldFiredRef.current = false;
              if (touchHoldTimerRef.current) {
                window.clearTimeout(touchHoldTimerRef.current);
                touchHoldTimerRef.current = null;
              }
              const target = (e.target as HTMLElement).closest('.ar-word') as HTMLElement | null;
              const word = target?.dataset.word;
              if (!target || !word) {
                touchStartRef.current = null;
                return;
              }
              const t = e.touches[0];
              touchStartRef.current = { x: t.clientX, y: t.clientY, word, el: target };

              const holdAction = prefsRef.current.touchGestures.hold;
              if (holdAction !== 'none') {
                touchHoldTimerRef.current = window.setTimeout(() => {
                  if (!touchStartRef.current || touchStartRef.current.word !== word) return;
                  touchHoldFiredRef.current = true;
                  touchSuppressContextMenuRef.current = true;
                  const { x, y } = computeWordXY(target);
                  const sentence = prefsRef.current.sentenceContextEnabled ? extractSentence(target) ?? undefined : undefined;
                  dispatchTouchAction(holdAction, word, sectionHref, x, y, sentence);
                }, TOUCH_HOLD_MS);
              }
            },
            { passive: true }
          );

          doc.body.addEventListener(
            'touchmove',
            (e) => {
              const start = touchStartRef.current;
              if (!start) return;
              const t = e.touches[0];
              if (
                Math.abs(t.clientX - start.x) > TOUCH_MOVE_CANCEL_PX ||
                Math.abs(t.clientY - start.y) > TOUCH_MOVE_CANCEL_PX
              ) {
                if (touchHoldTimerRef.current) {
                  window.clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = null;
                }
                // A real drag (scrolling, or extending a text selection) —
                // hand this touch back to native handling entirely.
                touchStartRef.current = null;
              }
            },
            { passive: true }
          );

          doc.body.addEventListener(
            'touchend',
            (e) => {
              if (touchHoldTimerRef.current) {
                window.clearTimeout(touchHoldTimerRef.current);
                touchHoldTimerRef.current = null;
              }
              const start = touchStartRef.current;
              touchStartRef.current = null;
              if (!start) return;
              if (touchHoldFiredRef.current) {
                e.preventDefault(); // hold already handled this touch
                return;
              }

              const { word, el } = start;
              const now = Date.now();
              const isDoubleTap = !!(
                lastTapRef.current &&
                lastTapRef.current.word === word &&
                now - lastTapRef.current.time <= DOUBLE_TAP_WINDOW_MS
              );
              lastTapRef.current = isDoubleTap ? null : { word, time: now };

              const action = isDoubleTap ? prefsRef.current.touchGestures.doubleTap : prefsRef.current.touchGestures.singleTap;
              if (action === 'none') return; // fall back to the native click -> full popup

              if (isDoubleTap) {
                // Under the instant-tap model, tap #1 already fired
                // Single tap's own action (typically opening the bubble)
                // before there was any way to know a second tap was
                // coming. If that left a bubble open, close it now --
                // whatever Double tap does instead, the bubble from tap #1
                // shouldn't linger on screen afterwards.
                setBubble(null);
              }

              e.preventDefault();
              const { x, y } = computeWordXY(el);
              const sentence = prefsRef.current.sentenceContextEnabled ? extractSentence(el) ?? undefined : undefined;
              dispatchTouchAction(action, word, sectionHref, x, y, sentence);
            },
            { passive: false }
          );

          // Only ever suppresses the native long-press context menu / text
          // selection magnifier for the specific touch that just triggered
          // a Hold gesture above — everything else's native context menu
          // (e.g. a genuine long-press-to-select elsewhere) is untouched.
          doc.addEventListener('contextmenu', (e) => {
            if (touchSuppressContextMenuRef.current) {
              e.preventDefault();
              touchSuppressContextMenuRef.current = false;
            }
          });

          // Horizontal swipe page-turn. Deliberately a fully separate
          // touchstart/touchend pair from the word-tap system above (which
          // only tracks touches starting on a word) -- a swipe can start
          // anywhere on the page. Only ever *reads* the gesture on
          // touchend and only acts past SWIPE_MIN_PX of predominantly
          // horizontal travel, so it never competes with a tap, a
          // long-press, or a drag-to-select for the same touch: those stay
          // under the threshold (a tap) or move but get their own meaning
          // from a text selection actually existing (checked below), which
          // this only fires for when there isn't one.
          doc.body.addEventListener(
            'touchstart',
            (e) => {
              const t = e.touches[0];
              swipeStartRef.current = { x: t.clientX, y: t.clientY };
            },
            { passive: true }
          );
          doc.body.addEventListener(
            'touchend',
            (e) => {
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              if (!start || prefsRef.current.readingFlow !== 'paginated') return;
              const t = e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;
              // A real drag-to-select left an actual selection behind --
              // respect it, don't also turn the page out from under it.
              if (doc.getSelection()?.toString()) return;

              const dir = serviceRef.current?.getCurrentDirection() ?? 'rtl';
              const swipedRight = dx > 0;
              // RTL: swipe right -> previous, swipe left -> next.
              // LTR: swipe left -> previous, swipe right -> next.
              const goingNext = dir === 'rtl' ? !swipedRight : swipedRight;
              dismissHoverPreview();
              setBubble(null);
              if (goingNext) serviceRef.current?.next();
              else serviceRef.current?.prev();
            },
            { passive: true }
          );

          // Capture phase, and *before* the word-click listener above: epub.js
          // attaches its own `onclick` directly on every internal <a> (see
          // resolveFootnote.ts for why), which fires during the target phase —
          // strictly before a bubble-phase listener like the one above ever
          // sees the event. Catching it in capture on doc.body runs first, so
          // preventDefault + stopPropagation here actually stops epub.js from
          // navigating away for a footnote link, instead of running too late.
          doc.body.addEventListener(
            'click',
            (e) => {
              const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
              if (!anchor || !isFootnoteLink(anchor)) return;
              e.preventDefault();
              e.stopPropagation();
              const iframeEl = doc.defaultView?.frameElement as HTMLIFrameElement | undefined;
              const iframeRect = iframeEl?.getBoundingClientRect();
              const targetRect = anchor.getBoundingClientRect();
              const x = (iframeRect?.left ?? 0) + targetRect.left + targetRect.width / 2;
              const y = (iframeRect?.top ?? 0) + targetRect.top;
              handleFootnoteClick(anchor, doc, sectionHref, x, y);
            },
            true
          );
        });

        svc.onSelected((info) => {
          setPopup(null);
          setBubble(null);
          dismissHoverPreview();
          setSelection(info);
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this book.');
      }
    })();

    // Host-page twin of the quick-add listener attached inside each
    // rendered iframe above — covers the case where focus has moved back
    // to the outer page (e.g. right after closing a popup with its own
    // close button, which lives outside the iframe).
    window.addEventListener('keydown', handleQuickAddKeydown);

    return () => {
      cancelled = true;
      if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
      if (quickAddToastTimeoutRef.current) window.clearTimeout(quickAddToastTimeoutRef.current);
      if (touchToastTimeoutRef.current) window.clearTimeout(touchToastTimeoutRef.current);
      if (touchHoldTimerRef.current) window.clearTimeout(touchHoldTimerRef.current);
      window.removeEventListener('keydown', handleQuickAddKeydown);
      // Fire-and-forget — the Reader is unmounting (book closed, or
      // switching to a different book) so there's nothing left to await
      // into; finish() itself no-ops if the session was too short to be
      // worth a row (see MIN_SESSION_MS_TO_SAVE).
      sessionTrackerRef.current?.finish();
      sessionTrackerRef.current = null;
      svc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Reading controls (Settings panel) apply live, without reopening the book.
  useEffect(() => {
    if (ready) serviceRef.current?.applyPreferences(prefs);
  }, [ready, prefs.fontSizePct, prefs.lineHeight, prefs.fontFamily, prefs.readingFlow, prefs.pageDirection, prefs.theme]);

  // Refresh the saved-word colour in every currently-rendered section the
  // instant the theme changes, rather than waiting for that section to
  // re-render on its own (a page turn away and back) -- otherwise a reader
  // who switches to Night mid-page would see stale (wrong-theme) red text
  // until the next page turn.
  useEffect(() => {
    if (!ready) return;
    const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && document.documentElement.dataset.theme === 'dark');
    containerRef.current?.querySelectorAll('iframe').forEach((iframe) => {
      const doc = (iframe as HTMLIFrameElement).contentDocument;
      const style = doc?.getElementById('ar-word-style') as HTMLStyleElement | null;
      if (style) style.textContent = wordStyle(isDark);
    });
  }, [ready, prefs.theme]);

  // Focus mode: the topbar/footer fade out after a moment of stillness and
  // come back on a deliberate tap (see the click handlers below — a plain
  // click, unlike scroll/touchmove, only fires for an actual tap, not for
  // scrolling through the book or dragging to turn a page). Mirrors the
  // Midnight Study concept's "controls fade on stillness" behavior and
  // Apple Books' "just the page, tap for controls" reading view.
  //
  // The sidebar (see onFocusChromeChange, sidebarPeek below) deliberately
  // does *not* share this tap-to-reveal: it used to come back on any touch
  // at all, which made it pop back up mid-scroll constantly. Bringing back
  // a whole extra panel warrants more friction than bringing back a slim
  // topbar, so it only reappears via an explicit left-edge drag.
  useEffect(() => {
    if (!focusMode) {
      setTopbarIdle(false);
      setSidebarPeek(false);
      if (focusIdleTimerRef.current) window.clearTimeout(focusIdleTimerRef.current);
      return;
    }
    function scheduleIdle() {
      setTopbarIdle(false);
      if (focusIdleTimerRef.current) window.clearTimeout(focusIdleTimerRef.current);
      focusIdleTimerRef.current = window.setTimeout(() => {
        setTopbarIdle(true);
        setSidebarPeek(false);
      }, FOCUS_IDLE_MS);
    }
    scheduleIdleRef.current = scheduleIdle;
    scheduleIdle();
    window.addEventListener('click', scheduleIdle);

    // Left-edge drag to reveal the sidebar -- must start within
    // EDGE_ZONE_PX of the screen edge and travel at least EDGE_DRAG_PX
    // mostly-horizontally to count, so an ordinary vertical scroll or a
    // tap near the edge never triggers it by accident.
    const EDGE_ZONE_PX = 24;
    const EDGE_DRAG_PX = 48;
    let dragStart: { x: number; y: number } | null = null;

    function onPointerDown(e: PointerEvent) {
      dragStart = e.clientX <= EDGE_ZONE_PX ? { x: e.clientX, y: e.clientY } : null;
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = Math.abs(e.clientY - dragStart.y);
      if (dx > EDGE_DRAG_PX && dy < EDGE_DRAG_PX) {
        setSidebarPeek(true);
        scheduleIdle();
        dragStart = null;
      }
    }
    function onPointerUp() {
      dragStart = null;
    }
    edgePointerDownRef.current = onPointerDown;
    edgePointerMoveRef.current = onPointerMove;
    edgePointerUpRef.current = onPointerUp;
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('click', scheduleIdle);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (focusIdleTimerRef.current) window.clearTimeout(focusIdleTimerRef.current);
    };
  }, [focusMode]);

  useEffect(() => {
    onFocusChromeChange?.(focusMode && topbarIdle && !sidebarPeek);
  }, [focusMode, topbarIdle, sidebarPeek, onFocusChromeChange]);

  // Reset the sidebar/chrome the moment this Reader instance goes away
  // (navigating back to the library, say) -- otherwise a focus session that
  // was mid-idle would leave the sidebar hidden behind on a screen that no
  // longer has any way to reveal it again.
  useEffect(() => {
    return () => onFocusChromeChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host-page half of the session-activity signal (the iframe half is
  // wired up per rendered section above) — covers interacting with the
  // reader's own chrome (footer page-turn buttons, the TOC, etc.) so the
  // idle cutoff doesn't fire just because the last click landed outside
  // the epub iframe.
  useEffect(() => {
    function record() {
      sessionTrackerRef.current?.recordActivity();
    }
    window.addEventListener('mousemove', record);
    window.addEventListener('click', record);
    window.addEventListener('keydown', record);
    return () => {
      window.removeEventListener('mousemove', record);
      window.removeEventListener('click', record);
      window.removeEventListener('keydown', record);
    };
  }, []);

  function dismissHoverPreview() {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverTokenRef.current++; // invalidates any lookup already in flight
    setHoverPreview(null);
  }

  async function handleWordHover(word: string, token: number, x: number, y: number) {
    const result = await dictionaryManager.lookup(word);
    // The pointer may have moved to a different word (or off words entirely)
    // while this lookup — even a cached one resolves on a later tick — was
    // in flight; a stale token means don't resurrect a preview for it.
    if (token !== hoverTokenRef.current) return;
    const gloss = result.entries[0]?.senses[0]?.gloss;
    if (!gloss) return; // nothing found for this word — stay silent rather than show an empty pill
    const condensed = gloss.length > HOVER_PREVIEW_MAX_CHARS ? gloss.slice(0, HOVER_PREVIEW_MAX_CHARS - 1) + '…' : gloss;
    setHoverPreview({ word, x, y, gloss: condensed });
  }

  async function handleWordClick(word: string, sectionHref: string, x: number, y: number, sentence?: string) {
    dismissHoverPreview();
    sessionTrackerRef.current?.recordLookup();
    setPopup({ word, x, y, result: null, instance: null, saved: false, loading: true });
    const [result, saved] = await Promise.all([
      dictionaryManager.lookup(word),
      vocabularyService.isSaved(book.id, word),
    ]);
    const morphology = result.morphology?.[0];
    const instance = await vocabularyService.recordLookup(book.id, word, {
      chapterHref: sectionHref,
      sentence,
      lemma: morphology?.lemma,
      root: morphology?.root ?? result.entries[0]?.root,
    });
    const resolved: PopupState = { word, x, y, result, instance, saved, loading: false };
    setPopup(resolved);
    lastLookupRef.current = resolved;
  }

  /** Shared by the popup's "+ Add to vocabulary" button and the quick-add
   * shortcut — both just need a resolved lookup (word + dictionary result +
   * word-instance) to save from. */
  async function saveWord(target: PopupState): Promise<VocabularyItem | undefined> {
    if (!target.result || target.saved) return undefined;
    return vocabularyService.saveToVocabulary({
      surfaceForm: target.word,
      entries: target.result.entries,
      lemma: target.result.morphology?.[0]?.lemma,
      root: target.result.morphology?.[0]?.root ?? target.result.entries[0]?.root,
      pos: target.result.morphology?.[0]?.pos,
      book,
      wordInstance: target.instance ?? undefined,
    });
  }

  /** The popup's per-entry "+" — saves just the one entry the reader tapped,
   * as its own card, rather than every entry the lookup found (see
   * saveWord above). Doesn't check/flip `popup.saved`: a word can end up
   * with several of these alongside (or instead of) the "all entries" card,
   * so there's no single boolean answer to "is this word saved" any more —
   * the popup's own per-entry buttons track their own tapped state instead. */
  async function saveWordEntry(target: PopupState, entry: DictionaryEntry) {
    if (!target.result) return;
    await vocabularyService.saveToVocabulary({
      surfaceForm: target.word,
      entries: [entry],
      root: entry.root,
      lemma: entry.lemma,
      pos: entry.senses[0]?.pos,
      book,
      wordInstance: target.instance ?? undefined,
    });
    markWordSavedInDom(target.word, true);
  }

  /** Toggles the muted-red saved-word styling on every occurrence of `word`
   * across every currently-rendered section (epub.js can have more than one
   * mounted at once) -- lets Save/un-save reflect immediately in the
   * reading text instead of waiting for the next page render's own
   * `vocabularyService.listForBook` pass (see the `onRendered` setup
   * above). */
  function markWordSavedInDom(word: string, isSaved: boolean): void {
    const iframes = containerRef.current?.querySelectorAll('iframe') ?? [];
    iframes.forEach((iframe) => {
      const doc = (iframe as HTMLIFrameElement).contentDocument;
      doc?.querySelectorAll<HTMLElement>('.ar-word').forEach((el) => {
        if (el.dataset.word === word) el.classList.toggle('ar-word--saved', isSaved);
      });
    });
  }

  /** Runs whichever action a touch gesture is bound to (see Settings →
   * Touch gestures). 'none' never reaches here — callers check first, so
   * an unhandled tap falls through to the ordinary click → full popup
   * path instead. */
  function dispatchTouchAction(
    action: TouchDictionaryAction,
    word: string,
    sectionHref: string,
    x: number,
    y: number,
    sentence?: string
  ) {
    if (action === 'bubble') openBubble(word, sectionHref, x, y, sentence);
    else if (action === 'openDictionary') handleWordClick(word, sectionHref, x, y, sentence);
    else if (action === 'quickSave') quickSaveWord(word, sectionHref, sentence);
  }

  /** The condensed DictionaryBubble's lookup — same primitives as
   * handleWordClick (lookup + isSaved + recordLookup), just resolving into
   * `bubble` state instead of `popup`. Tokenized like the hover preview so
   * a fast second tap on a *different* word can't have its bubble
   * clobbered by a slower, now-stale lookup for the first word. */
  async function openBubble(word: string, sectionHref: string, x: number, y: number, sentence?: string) {
    dismissHoverPreview();
    sessionTrackerRef.current?.recordLookup();
    const token = ++bubbleTokenRef.current;
    setBubble({ word, x, y, result: null, instance: null, saved: false, loading: true });
    const [result, saved] = await Promise.all([
      dictionaryManager.lookup(word),
      vocabularyService.isSaved(book.id, word),
    ]);
    const morphology = result.morphology?.[0];
    const instance = await vocabularyService.recordLookup(book.id, word, {
      chapterHref: sectionHref,
      sentence,
      lemma: morphology?.lemma,
      root: morphology?.root ?? result.entries[0]?.root,
    });
    if (token !== bubbleTokenRef.current) return; // superseded by a newer tap
    setBubble({ word, x, y, result, instance, saved, loading: false });
  }

  /** Looks a word up and saves it straight to vocabulary with no bubble or
   * popup at all — just a brief toast, per the "instant, minimal
   * disruption" touch-gesture design. Guards against creating a duplicate
   * vocabulary entry if the word was already saved (there's no "+" button
   * here to just disable, unlike the popup/bubble). */
  async function quickSaveWord(word: string, sectionHref: string, sentence?: string) {
    sessionTrackerRef.current?.recordLookup();
    const [result, alreadySaved] = await Promise.all([
      dictionaryManager.lookup(word),
      vocabularyService.isSaved(book.id, word),
    ]);
    if (alreadySaved) {
      showTouchToast(`"${word}" is already in your vocabulary`, null);
      return;
    }
    const morphology = result.morphology?.[0];
    const root = morphology?.root ?? result.entries[0]?.root;
    const instance = await vocabularyService.recordLookup(book.id, word, {
      chapterHref: sectionHref,
      sentence,
      lemma: morphology?.lemma,
      root,
    });
    if (!result.entries.length) {
      showTouchToast(`No dictionary entry found for "${word}"`, null);
      return;
    }
    const item = await vocabularyService.saveToVocabulary({
      surfaceForm: word,
      entries: result.entries,
      lemma: morphology?.lemma,
      root,
      pos: morphology?.pos,
      book,
      chapterHref: sectionHref,
      wordInstance: instance,
    });
    showTouchToast(`✓ Saved "${word}"`, item.id);
  }

  function showTouchToast(message: string, undoItemId: string | null) {
    if (touchToastTimeoutRef.current) window.clearTimeout(touchToastTimeoutRef.current);
    setTouchToast({ message, undoItemId });
    touchToastTimeoutRef.current = window.setTimeout(() => setTouchToast(null), 3000);
  }

  async function undoTouchToast() {
    if (!touchToast?.undoItemId) return;
    await vocabularyService.removeFromVocabulary(touchToast.undoItemId);
    if (touchToastTimeoutRef.current) window.clearTimeout(touchToastTimeoutRef.current);
    setTouchToast(null);
  }

  function showQuickAddToast(message: string) {
    if (quickAddToastTimeoutRef.current) window.clearTimeout(quickAddToastTimeoutRef.current);
    setQuickAddToast(message);
    quickAddToastTimeoutRef.current = window.setTimeout(() => setQuickAddToast(null), 1800);
  }

  async function handleQuickAddKeydown(e: KeyboardEvent) {
    if (!prefsRef.current.quickAddShortcutEnabled) return;
    if (!(e.ctrlKey && e.shiftKey && e.code === 'KeyA')) return;
    e.preventDefault();
    const target = lastLookupRef.current;
    if (!target || target.loading) {
      showQuickAddToast('No word looked up yet — click a word first');
      return;
    }
    if (target.saved) {
      showQuickAddToast(`"${target.word}" is already in your vocabulary`);
      return;
    }
    if (!target.result?.entries.length) {
      showQuickAddToast('No dictionary entry to save for this word');
      return;
    }
    await saveWord(target);
    lastLookupRef.current = { ...target, saved: true };
    setPopup((p) => (p && p.word === target.word ? { ...p, saved: true } : p));
    showQuickAddToast(`"${target.word}" added to vocabulary`);
  }

  async function handleFootnoteClick(anchor: HTMLAnchorElement, doc: Document, sectionHref: string, x: number, y: number) {
    dismissHoverPreview();
    const href = anchor.getAttribute('href') || '';
    setFootnote({ href, sectionHref, x, y, loading: true, html: null, failed: false });
    const content = await serviceRef.current?.loadFootnote(anchor, doc, sectionHref);
    setFootnote((prev) => {
      // The popup may have been dismissed (or a different note clicked)
      // while this was loading — don't resurrect a stale one.
      if (!prev || prev.href !== href) return prev;
      return content
        ? { ...prev, loading: false, html: content.html, failed: false }
        : { ...prev, loading: false, html: null, failed: true };
    });
  }

  function handleGoToNote() {
    if (!footnote) return;
    serviceRef.current?.goToFootnote(footnote.href, footnote.sectionHref);
    setFootnote(null);
  }

  async function handleHighlightPick(color: HighlightColor) {
    if (!selection) return;
    const svc = serviceRef.current;
    const sectionHref = svc?.getCurrentSectionHref();
    await annotationService.create({
      book,
      cfiRange: selection.cfiRange,
      text: selection.text,
      color,
      chapterHref: sectionHref,
      chapterLabel: svc?.getChapterLabelFor(sectionHref),
    });
    svc?.renderHighlight(selection.cfiRange, color);
    svc?.clearSelection();
    setSelection(null);
  }

  function dismissSelection() {
    serviceRef.current?.clearSelection();
    setSelection(null);
  }

  /** The popup's primary "Save Vocabulary" / "✓ Vocabulary" button -- a real
   * toggle (feature request: removing a word must not require opening
   * Edit). Saving re-runs the same "all entries, one card" path `saveWord`
   * always used; un-saving removes every card this word has in this book
   * (see `removeAllForWord`), not just the "all entries" one, so the
   * button's own saved/unsaved state stays a simple, honest reflection of
   * "is this word saved at all" instead of tracking which specific card. */
  async function handleSave() {
    if (!popup) return;
    if (popup.saved) {
      await vocabularyService.removeAllForWord(book.id, popup.word);
      markWordSavedInDom(popup.word, false);
      setPopup((p) => (p ? { ...p, saved: false } : p));
      lastLookupRef.current =
        lastLookupRef.current?.word === popup.word ? { ...lastLookupRef.current, saved: false } : lastLookupRef.current;
      return;
    }
    await saveWord(popup);
    markWordSavedInDom(popup.word, true);
    setPopup((p) => (p ? { ...p, saved: true } : p));
    lastLookupRef.current = lastLookupRef.current?.word === popup.word ? { ...lastLookupRef.current, saved: true } : lastLookupRef.current;
  }

  /** The Edit modal's own "Save Vocabulary" — works whether the word was
   * already saved (edits its existing card) or not (Edit can be opened
   * before ever saving, to customize the card before it exists at all): if
   * there's no card yet, `saveWord` creates the normal "all entries" one
   * first, then the edited meaning/sentence are applied on top of it. */
  async function handleEditSave(patch: { meaning: string; sentence: string | undefined; surfaceForm: string }) {
    if (!editingWord) return;
    let item: VocabularyItem | undefined;
    if (editingWord.saved) {
      const existing = await vocabularyService.getForWord(book.id, editingWord.word);
      item = existing.find((i) => i.selectedEntryIndex === undefined) ?? existing[0];
    } else {
      item = await saveWord(editingWord);
    }
    if (item) {
      await vocabularyService.updateVocabularyItem(item, {
        meaning: patch.meaning,
        sentence: patch.sentence,
        surfaceForm: patch.surfaceForm,
      });
    }
    markWordSavedInDom(editingWord.word, true);
    setPopup((p) => (p && p.word === editingWord.word ? { ...p, saved: true } : p));
    lastLookupRef.current =
      lastLookupRef.current?.word === editingWord.word ? { ...lastLookupRef.current, saved: true } : lastLookupRef.current;
    setEditingWord(null);
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchResults(null);
    setActiveResultIndex(0);
    try {
      if (searchScope === 'library') {
        setSearchResults(await searchLibrary(query, searchMode));
        return;
      }
      const sectionHref = searchScope === 'page' ? serviceRef.current?.getCurrentSectionHref() : undefined;
      const results = await serviceRef.current?.search(query, { mode: searchMode, sectionHref });
      setSearchResults((results ?? []).map((r) => ({ ...r, book })));
    } finally {
      setSearching(false);
    }
  }

  /** "Entire library" scope: opens every other book in a hidden, detached
   * container just long enough to search it, then tears it down --
   * reuses the exact same EpubService.search() this reader already uses
   * for its own book, just against a temporary instance per book, rather
   * than a second search implementation. Sequential (not parallel) so a
   * large library doesn't try to hold many books' DOM in memory at once. */
  async function searchLibrary(query: string, mode: SearchMode): Promise<AnySearchResult[]> {
    const books = await libraryService.listBooks();
    const all: AnySearchResult[] = [];
    for (const b of books) {
      const file = await libraryService.getBookFile(b.id);
      if (!file) continue;
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-99999px;top:0;width:400px;height:600px;visibility:hidden;';
      document.body.appendChild(container);
      const tempSvc = new EpubService();
      try {
        await tempSvc.open(file, container, undefined, prefsRef.current);
        const results = await tempSvc.search(query, { mode });
        all.push(...results.map((r) => ({ ...r, book: b })));
      } catch {
        // A book that fails to parse/open just contributes no results,
        // rather than aborting the whole library search over one bad file.
      } finally {
        tempSvc.destroy();
        container.remove();
      }
    }
    return all;
  }

  function goToResult(index: number) {
    const results = searchResults;
    if (!results || results.length === 0) return;
    const wrapped = ((index % results.length) + results.length) % results.length;
    setActiveResultIndex(wrapped);
    const result = results[wrapped];
    if (result.book.id === book.id) {
      serviceRef.current?.goTo(result.cfi);
    } else {
      // A library-scope result from a different book -- Reader can't
      // switch the active book itself, that's App.tsx's state.
      onOpenBookAt?.(result.book, result.cfi);
    }
  }

  // Live search (Settings toggle): re-run the search a moment after typing
  // stops, rather than on every keystroke -- a full-book search walks every
  // section, so debouncing keeps it from re-scanning the whole book on each
  // character typed. Never auto-triggers for Library scope regardless of
  // the setting -- that opens every book in the library per search, which
  // is far too expensive to re-run on every pause in typing; Library scope
  // always waits for an explicit Search submit.
  useEffect(() => {
    if (!searchOpen || !prefs.liveSearchEnabled || searchScope === 'library') return;
    if (liveSearchTimerRef.current) window.clearTimeout(liveSearchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    liveSearchTimerRef.current = window.setTimeout(() => handleSearch(), 350);
    return () => {
      if (liveSearchTimerRef.current) window.clearTimeout(liveSearchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, prefs.liveSearchEnabled, searchOpen, searchScope, searchMode]);

  // Changing scope/mode invalidates whatever results are showing -- they
  // were computed under the old scope/mode, so keep them from looking like
  // (wrong) answers to the new one until the reader searches again.
  useEffect(() => {
    setSearchResults(null);
  }, [searchScope, searchMode]);

  // Esc closes the search overlay (desktop) -- and, per the "search is
  // temporary/contextual, not a destination" feature request, this and the
  // X button are the only ways it closes; the underlying reading position
  // is never touched by opening/closing it.
  useEffect(() => {
    if (!searchOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  // Remember recent searches (Settings → Search history) -- purely a
  // reader convenience (reusable from the dropdown below), not shared or
  // synced anywhere.
  useEffect(() => {
    if (searchOpen) {
      try {
        setRecentSearches(JSON.parse(localStorage.getItem('ar-reader-search-history') ?? '[]'));
      } catch {
        setRecentSearches([]);
      }
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!prefs.searchHistoryEnabled || !searchResults || searchResults.length === 0) return;
    const q = searchQuery.trim();
    if (!q) return;
    try {
      const key = 'ar-reader-search-history';
      const prev: string[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, 8);
      localStorage.setItem(key, JSON.stringify(next));
      setRecentSearches(next);
    } catch {
      /* localStorage unavailable -- history just won't persist, harmless */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults]);

  /** Adds a bookmark at the exact current location -- multiple per page are
   * fine (each gets its own cfi/id), matching the feature request. */
  async function handleAddBookmark() {
    const loc = currentLocationRef.current;
    if (!loc) return;
    const bm = await bookmarkService.create({
      book,
      cfi: loc.cfi,
      percent: loc.percent,
      pageLabel: serviceRef.current?.getPageLabel(loc.cfi),
      chapterHref: loc.chapterHref,
      chapterLabel: loc.chapterLabel,
    });
    setBookmarks((prev) => [...prev, bm]);
  }

  async function handleRemoveBookmark(id: string) {
    await bookmarkService.remove(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="reader">
      <header
        className={'reader__topbar' + (focusMode ? ' reader__topbar--focus' : '') + (topbarIdle ? ' reader__topbar--idle' : '')}
        onMouseEnter={() => setTopbarIdle(false)}
      >
        <button className="reader__back" onClick={onBack}>
          <IconBack size={14} /> Library
        </button>
        <div className="reader__chapter">{chapterLabel}</div>
        <div className="reader__topbar-actions">
          <button
            className="reader__toc-toggle"
            onClick={() => setQuickSettingsOpen((v) => !v)}
            aria-label="Font and appearance"
            title="Font and appearance"
            style={{ fontFamily: 'serif', fontWeight: 600 }}
          >
            Aa
          </button>
          <label className={'reader__focus-toggle' + (focusMode ? ' reader__focus-toggle--on' : '')} title="Focus mode">
            <input
              type="checkbox"
              checked={focusMode}
              onChange={(e) => setFocusMode(e.target.checked)}
              aria-label="Toggle focus mode"
            />
            <IconFocus size={15} />
            <span className="reader__focus-toggle-track">
              <span className="reader__focus-toggle-knob" />
            </span>
          </label>
          <button
            className="reader__toc-toggle"
            onClick={() => {
              setSearchOpen((v) => !v);
              setTocOpen(false);
              setBookmarksOpen(false);
            }}
          >
            <IconSearch size={14} /> Search
          </button>
          <button
            className="reader__toc-toggle"
            onClick={handleAddBookmark}
            aria-label="Add bookmark here"
            title="Add bookmark here"
          >
            <IconBookmark size={14} />
          </button>
          <button
            className="reader__toc-toggle"
            onClick={() => {
              setBookmarksOpen((v) => !v);
              setTocOpen(false);
              setSearchOpen(false);
            }}
          >
            <IconBookmarkFilled size={14} /> Bookmarks{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
          </button>
          <button
            className="reader__toc-toggle"
            onClick={() => {
              setTocOpen((v) => !v);
              setSearchOpen(false);
              setBookmarksOpen(false);
            }}
          >
            <IconContents size={14} /> Contents
          </button>
        </div>
      </header>

      {quickSettingsOpen && <QuickSettingsPopover onClose={() => setQuickSettingsOpen(false)} />}

      <div className="reader__body">
        {tocOpen && (
          <aside className="reader__toc">
            <TocList
              items={toc}
              onSelect={(href) => {
                serviceRef.current?.goTo(href);
                setTocOpen(false);
              }}
            />
          </aside>
        )}

        {searchOpen && (
          <div className="reader__search-backdrop" onClick={() => setSearchOpen(false)}>
            <aside className="reader__search" onClick={(e) => e.stopPropagation()}>
              <div className="reader__search-top">
                <form
                  className="reader__search-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSearch();
                  }}
                >
                  <input
                    className="reader__search-input"
                    type="search"
                    placeholder={
                      searchScope === 'page' ? 'Search this page…' : searchScope === 'library' ? 'Search your library…' : 'Search this book…'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {(!prefs.liveSearchEnabled || searchScope === 'library') && (
                    <button className="btn btn--ghost" type="submit" disabled={searching || !searchQuery.trim()}>
                      {searching ? 'Searching…' : 'Search'}
                    </button>
                  )}
                </form>
                <button className="reader__search-close" onClick={() => setSearchOpen(false)} aria-label="Close search">
                  <IconClose size={14} />
                </button>
              </div>

              <div className="reader__search-options">
                <div className="reader__search-options-group">
                  {(['page', 'book', 'library'] as SearchScope[]).map((s) => (
                    <button
                      key={s}
                      className={'reader__search-option' + (searchScope === s ? ' reader__search-option--active' : '')}
                      onClick={() => setSearchScope(s)}
                    >
                      {s === 'page' ? 'This page' : s === 'book' ? 'This book' : 'Library'}
                    </button>
                  ))}
                </div>
                <div className="reader__search-options-group">
                  {(['phrase', 'word'] as SearchMode[]).map((m) => (
                    <button
                      key={m}
                      className={'reader__search-option' + (searchMode === m ? ' reader__search-option--active' : '')}
                      onClick={() => setSearchMode(m)}
                    >
                      {m === 'phrase' ? 'Exact phrase' : 'Any word'}
                    </button>
                  ))}
                </div>
              </div>

              {searchResults && searchResults.length > 0 && (
                <div className="reader__search-nav">
                  <span>{searchResults.length} result{searchResults.length === 1 ? '' : 's'}</span>
                  <div className="reader__search-nav-controls">
                    <button onClick={() => goToResult(activeResultIndex - 1)} aria-label="Previous result">
                      ↑
                    </button>
                    <span>
                      {activeResultIndex + 1} / {searchResults.length}
                    </span>
                    <button onClick={() => goToResult(activeResultIndex + 1)} aria-label="Next result">
                      ↓
                    </button>
                  </div>
                </div>
              )}

              {!searchResults && !searching && prefs.searchHistoryEnabled && recentSearches.length > 0 && (
                <div className="reader__search-history">
                  <span className="reader__search-history-label">Recent</span>
                  {recentSearches.map((h) => (
                    <button
                      key={h}
                      className="reader__search-history-item"
                      onClick={() => {
                        setSearchQuery(h);
                        if (!prefs.liveSearchEnabled) handleSearch();
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}

              {searchResults && (
                <div className="reader__search-results">
                  {searchResults.length === 0 && <p className="reader__search-empty">No matches found.</p>}
                  {searchResults.map((r, i) => (
                    <button
                      key={r.book.id + r.cfi + i}
                      className={'reader__search-result' + (i === activeResultIndex ? ' reader__search-result--active' : '')}
                      onClick={() => goToResult(i)}
                    >
                      {(searchScope === 'library' || r.label) && (
                        <div className="reader__search-result-label">
                          {searchScope === 'library' ? r.book.title : r.label}
                          {searchScope === 'library' && r.label ? ` — ${r.label}` : ''}
                        </div>
                      )}
                      <div className="reader__search-result-excerpt">{r.excerpt}</div>
                    </button>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {bookmarksOpen && (
          <aside className="reader__toc reader__bookmarks">
            <button className="btn btn--ghost reader__bookmarks-add" onClick={handleAddBookmark}>
              <IconBookmark size={14} /> Add bookmark here
            </button>
            {bookmarks.length === 0 ? (
              <p className="reader__search-empty">No bookmarks in this book yet.</p>
            ) : (
              <div className="reader__bookmarks-list">
                {[...bookmarks]
                  .sort((a, b) => a.percent - b.percent)
                  .map((bm) => (
                    <div className="reader__bookmark-item" key={bm.id}>
                      <button
                        className="reader__bookmark-item-main"
                        onClick={() => {
                          serviceRef.current?.goTo(bm.cfi);
                          setBookmarksOpen(false);
                        }}
                      >
                        <IconBookmarkFilled size={13} />
                        <span className="reader__bookmark-item-text">
                          {bm.chapterLabel && <span className="reader__bookmark-item-chapter">{bm.chapterLabel}</span>}
                          <span className="reader__bookmark-item-location">{bm.locationLabel}</span>
                        </span>
                      </button>
                      <button
                        className="reader__bookmark-item-remove"
                        onClick={() => handleRemoveBookmark(bm.id)}
                        aria-label="Remove bookmark"
                        title="Remove bookmark"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </aside>
        )}

        <div className="reader__stage">
          {error && <div className="reader__error">{error}</div>}
          {!ready && !error && <div className="reader__loading">Opening book…</div>}
          <div className="reader__epub-frame" style={{ width: `${prefs.readingWidthPct}%` }}>
            <div className="reader__epub" ref={containerRef} />
          </div>
        </div>

        {vocabPanelOpen && (
          <VocabLevels
            book={book}
            bookHandle={bookHandle}
            collapsed={vocabPanelCollapsed}
            onToggleCollapse={() => setVocabPanelCollapsed((v) => !v)}
            onClose={() => onVocabPanelOpenChange?.(false)}
            onJumpToWord={(sectionHref, word, indexInSection) => {
              dismissHoverPreview();
              setPopup(null);
              setBubble(null);
              setFootnote(null);
              serviceRef.current?.goToWordOccurrence(sectionHref, word, indexInSection);
            }}
          />
        )}
      </div>

      <footer
        className={'reader__footer' + (focusMode ? ' reader__footer--focus' : '') + (topbarIdle ? ' reader__footer--idle' : '')}
        onMouseEnter={() => setTopbarIdle(false)}
      >
        {/* Arrow direction follows the book's RTL page-turn direction (› = back
            a page, ‹ = forward a page) — the "Previous"/"Next" text is what
            actually says which way each button moves you. */}
        <button className="reader__nav-btn" onClick={() => serviceRef.current?.prev()} aria-label="Previous page">
          <span className="reader__nav-btn-icon">›</span>
          <span className="reader__nav-btn-label">Previous</span>
        </button>
        <div className="reader__progress">
          <div className="reader__progress-bar" style={{ width: `${Math.round(percent * 100)}%` }} />
        </div>
        <button className="reader__nav-btn" onClick={() => serviceRef.current?.next()} aria-label="Next page">
          <span className="reader__nav-btn-label">Next</span>
          <span className="reader__nav-btn-icon">‹</span>
        </button>
      </footer>

      {selection && (
        <SelectionToolbar x={selection.x} y={selection.y} onPick={handleHighlightPick} onDismiss={dismissSelection} />
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
          sizePct={prefs.dictionaryPopupSizePct}
          onClose={() => setPopup(null)}
          onSave={handleSave}
          onSaveEntry={(entry) => saveWordEntry(popup, entry)}
          onEdit={() => setEditingWord(popup)}
        />
      )}

      {editingWord && (
        <VocabularyEditModal
          bookId={book.id}
          word={editingWord.word}
          alreadySaved={editingWord.saved}
          fallbackMeaning={editingWord.result?.entries[0]?.senses[0]?.gloss ?? ''}
          fallbackSentence={editingWord.instance?.sentence}
          onCancel={() => setEditingWord(null)}
          onSave={handleEditSave}
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
          onOpenFull={() => {
            setPopup(bubble);
            lastLookupRef.current = bubble;
            setBubble(null);
          }}
          onSave={async () => {
            await saveWord(bubble);
            setBubble((b) => (b ? { ...b, saved: true } : b));
          }}
          onDismiss={() => setBubble(null)}
        />
      )}

      {footnote && (
        <FootnotePopup
          loading={footnote.loading}
          html={footnote.html}
          failed={footnote.failed}
          x={footnote.x}
          y={footnote.y}
          onClose={() => setFootnote(null)}
          onGoToNote={handleGoToNote}
        />
      )}

      {hoverPreview && <HoverPreview gloss={hoverPreview.gloss} x={hoverPreview.x} y={hoverPreview.y} />}

      {quickAddToast && <div className="reader__quick-add-toast">{quickAddToast}</div>}

      {touchToast && (
        <div className="reader__quick-add-toast reader__touch-toast">
          <span>{touchToast.message}</span>
          {touchToast.undoItemId && (
            <button className="reader__touch-toast-undo" onClick={undoTouchToast}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TocList({ items, onSelect }: { items: TocItem[]; onSelect: (href: string) => void }) {
  return (
    <ul className="toc-list">
      {items.map((item) => (
        <li key={item.href}>
          <button className="toc-list__item" onClick={() => onSelect(item.href)}>
            {item.label}
          </button>
          {item.subitems && <TocList items={item.subitems} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}
