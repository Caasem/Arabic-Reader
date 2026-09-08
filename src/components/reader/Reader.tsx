import { useEffect, useRef, useState } from 'react';
import { EpubService } from '../../reader/epub/EpubService';
import { wrapArabicWords, distinctWordsIn } from '../../reader/wordInteraction/wrapWords';
import { extractSentence } from '../../reader/wordInteraction/extractSentence';
import { dictionaryManager } from '../../dictionary/DictionaryManager';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { annotationService } from '../../reader/annotations/annotationService';
import { persistenceService } from '../../persistence/db';
import { libraryService } from '../../library/libraryService';
import type {
  BookMeta,
  DictionaryLookupResult,
  HighlightColor,
  TocItem,
  TouchDictionaryAction,
  WordInstance,
} from '../../types';
import { DictionaryPopup } from './DictionaryPopup';
import { DictionaryBubble } from './DictionaryBubble';
import { FootnotePopup } from './FootnotePopup';
import { HoverPreview } from './HoverPreview';
import { VocabLevels } from './VocabLevels';
import { SelectionToolbar } from './SelectionToolbar';
import type { Book } from 'epubjs';
import { usePreferences } from '../../state/PreferencesContext';
import { isFootnoteLink } from '../../reader/footnotes/resolveFootnote';
import './Reader.css';

/** Hover-intent delay before the condensed preview appears — long enough
 * that a mouse just passing over text on its way somewhere else doesn't
 * flash a preview for every word it crosses. */
const HOVER_PREVIEW_DELAY_MS = 200;
const HOVER_PREVIEW_MAX_CHARS = 42;

const WORD_STYLE = `
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
  .ar-word--saved { text-decoration: underline; text-decoration-color: rgba(156, 122, 79, 0.6); text-decoration-thickness: 2px; text-underline-offset: 3px; }
  .ar-word--jump-flash { background: rgba(230, 170, 60, 0.55) !important; }
`;

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
}: {
  book: BookMeta;
  onBack: () => void;
  /** Whether the Vocabulary Levels split panel is shown at all — driven by
   * the "Vocab Levels" nav tab (see App.tsx). Independent from the panel's
   * own collapse/expand strip, which is purely local UI state. */
  vocabPanelOpen?: boolean;
  onVocabPanelOpenChange?: (open: boolean) => void;
}) {
  const { prefs } = usePreferences();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<EpubService | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [chapterLabel, setChapterLabel] = useState<string | undefined>();
  const [percent, setPercent] = useState(0);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [bubble, setBubble] = useState<PopupState | null>(null);
  const [footnote, setFootnote] = useState<FootnoteState | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookHandle, setBookHandle] = useState<Book | null>(null);
  const [vocabPanelCollapsed, setVocabPanelCollapsed] = useState(false);
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
  const touchHoldTimerRef = useRef<number | null>(null);
  const touchHoldFiredRef = useRef(false);
  const touchSuppressContextMenuRef = useRef(false);
  const lastTapRef = useRef<{ word: string; time: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const svc = new EpubService();
    serviceRef.current = svc;

    (async () => {
      try {
        const file = await libraryService.getBookFile(book.id);
        if (!file || !containerRef.current) throw new Error('Could not read this book file.');
        const savedPos = await persistenceService.getReadingPosition(book.id);
        await svc.open(file, containerRef.current, savedPos?.cfi, prefsRef.current);
        if (cancelled) return;

        setToc(svc.getToc());
        setChapterLabel(savedPos?.chapterLabel);
        setPercent(savedPos?.percent ?? 0);
        setReady(true);
        setBookHandle(svc.getBookHandle());

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
          if (!doc.getElementById('ar-word-style')) {
            const style = doc.createElement('style');
            style.id = 'ar-word-style';
            style.textContent = WORD_STYLE;
            doc.head.appendChild(style);
          }
          wrapArabicWords(doc);

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
      svc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Reading controls (Settings panel) apply live, without reopening the book.
  useEffect(() => {
    if (ready) serviceRef.current?.applyPreferences(prefs);
  }, [ready, prefs.fontSizePct, prefs.lineHeight, prefs.fontFamily, prefs.readingFlow]);

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
  async function saveWord(target: PopupState) {
    if (!target.result || target.saved) return;
    await vocabularyService.saveToVocabulary({
      surfaceForm: target.word,
      entries: target.result.entries,
      lemma: target.result.morphology?.[0]?.lemma,
      root: target.result.morphology?.[0]?.root ?? target.result.entries[0]?.root,
      pos: target.result.morphology?.[0]?.pos,
      book,
      wordInstance: target.instance ?? undefined,
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

  async function handleSave() {
    if (!popup) return;
    await saveWord(popup);
    setPopup((p) => (p ? { ...p, saved: true } : p));
    lastLookupRef.current = lastLookupRef.current?.word === popup.word ? { ...lastLookupRef.current, saved: true } : lastLookupRef.current;
  }

  return (
    <div className="reader">
      <header className="reader__topbar">
        <button className="reader__back" onClick={onBack}>
          ‹ Library
        </button>
        <div className="reader__chapter">{chapterLabel}</div>
        <button className="reader__toc-toggle" onClick={() => setTocOpen((v) => !v)}>
          Contents
        </button>
      </header>

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

      <footer className="reader__footer">
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
          onClose={() => setPopup(null)}
          onSave={handleSave}
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
