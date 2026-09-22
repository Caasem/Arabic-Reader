import type { ReaderPreferences, TouchDictionaryAction } from '../../types';
import { isFootnoteLink } from '../footnotes/resolveFootnote';
import { extractSentence } from './extractSentence';
import { anchorOf, rectInHost, type HostRect } from './rectInHost';

/** A second tap on the same word within this window is a double tap. The
 * first tap's action is never delayed to wait for it. */
const DOUBLE_TAP_WINDOW_MS = 350;
/** A touch held still this long is a hold (long-press). */
const TOUCH_HOLD_MS = 500;
/** Moving further than this hands the touch back to the browser (scrolling,
 * or extending a text selection). */
const TOUCH_MOVE_CANCEL_PX = 10;
/** A page-turn swipe needs this much predominantly horizontal travel, well
 * beyond a wobbly tap or drag-to-select. */
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_VERTICAL_RATIO = 0.5;
const NEAR_BOTTOM_PX = 4;

export interface WordTarget {
  word: string;
  sectionHref: string;
  element: HTMLElement;
  rect: HostRect;
  x: number;
  y: number;
  sentence?: string;
}

export type TouchWordAction = Exclude<TouchDictionaryAction, 'none'>;

export interface SectionInteractionHandlers {
  prefs(): Pick<ReaderPreferences, 'touchGestures' | 'sentenceContextEnabled' | 'hoverPreviewEnabled' | 'readingFlow'>;
  pageDirection(): 'rtl' | 'ltr';
  /** A mouse click, or a tap whose gesture is bound to 'none'. */
  onWordClick(target: WordTarget): void;
  onTouchAction(action: TouchWordAction, target: WordTarget): void;
  /** A click or tap on page content that isn't a word. */
  onBackgroundClick(): void;
  /** The second tap of a double tap: whatever the first tap opened should close. */
  onDoubleTap(): void;
  onHoverStart(word: string, element: HTMLElement): void;
  onHoverEnd(): void;
  onSwipe(direction: 'next' | 'prev'): void;
  onFootnoteClick(anchor: HTMLAnchorElement, doc: Document, sectionHref: string, rect: HostRect): void;
  onActivity(): void;
  /** Scrolling layout only: whether the section is scrolled to its end. */
  onScrollEndChange(atEnd: boolean): void;
  onKeyDown(event: KeyboardEvent): void;
  onPointer: { down(event: PointerEvent): void; move(event: PointerEvent): void; up(): void };
}

/** Gesture state shared across a Reader's sections. */
export interface GestureState {
  lastTap: { word: string; time: number } | null;
}

export function createGestureState(): GestureState {
  return { lastTap: null };
}

const wordAt = (target: EventTarget | null) => (target as Element | null)?.closest?.<HTMLElement>('.ar-word') ?? null;

/**
 * Attaches every reader interaction to one rendered section document. Touch
 * handling never calls preventDefault on touchstart/touchmove (that would
 * break scrolling and drag-to-select); it only decides on touchend whether to
 * swallow the synthetic click that follows a handled tap.
 */
export function attachSectionInteractions(
  doc: Document,
  sectionHref: string,
  handlers: SectionInteractionHandlers,
  gestures: GestureState
): void {
  const body = doc.body;
  if (!body) return;

  const targetOf = (element: HTMLElement): WordTarget => {
    const rect = rectInHost(element);
    return {
      word: element.dataset.word!,
      sectionHref,
      element,
      rect,
      ...anchorOf(rect),
      sentence: handlers.prefs().sentenceContextEnabled ? (extractSentence(element) ?? undefined) : undefined,
    };
  };

  // Activity for the session tracker's idle cutoff.
  const activity = () => handlers.onActivity();
  doc.addEventListener('scroll', activity, { passive: true });
  doc.addEventListener('touchmove', activity, { passive: true });
  doc.addEventListener('keydown', activity);

  // End-of-chapter indicator for Scrolling layout (paginated layout uses
  // epub.js's own per-page flag instead; this document doesn't scroll there).
  const checkScrollEnd = () => {
    const scroller = doc.scrollingElement ?? doc.documentElement;
    handlers.onScrollEndChange(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX);
  };
  handlers.onScrollEndChange(false);
  checkScrollEnd();
  doc.addEventListener('scroll', checkScrollEnd, { passive: true });

  // Focus mode's edge-drag listens on the host window, which never sees
  // events inside this document. Clicks aren't forwarded on purpose: a tap on
  // blank page space shouldn't bring the reader chrome back.
  doc.addEventListener('pointerdown', (e) => handlers.onPointer.down(e));
  doc.addEventListener('pointermove', (e) => handlers.onPointer.move(e));
  doc.addEventListener('pointerup', () => handlers.onPointer.up());
  doc.addEventListener('pointercancel', () => handlers.onPointer.up());

  // Quick-add shortcut: focus is inside this document right after a word click.
  doc.addEventListener('keydown', (e) => handlers.onKeyDown(e));

  // Footnotes, in the capture phase: epub.js attaches its own navigating click
  // handler directly to each link, which a bubbling listener would run after.
  body.addEventListener(
    'click',
    (e) => {
      const anchor = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!anchor || !isFootnoteLink(anchor)) return;
      e.preventDefault();
      e.stopPropagation();
      handlers.onFootnoteClick(anchor, doc, sectionHref, rectInHost(anchor));
    },
    true
  );

  body.addEventListener('click', (e) => {
    const element = wordAt(e.target);
    if (!element) {
      handlers.onBackgroundClick();
      return;
    }
    if (element.dataset.word) handlers.onWordClick(targetOf(element));
  });

  body.addEventListener('mouseover', (e) => {
    if (!handlers.prefs().hoverPreviewEnabled) return;
    const element = wordAt(e.target);
    const related = e.relatedTarget as Node | null;
    if (!element?.dataset.word || (related && element.contains(related))) return;
    handlers.onHoverStart(element.dataset.word, element);
  });

  body.addEventListener('mouseout', (e) => {
    const element = wordAt(e.target);
    const related = e.relatedTarget as Node | null;
    if (!element || (related && element.contains(related))) return;
    handlers.onHoverEnd();
  });

  // --- Word taps: single tap, double tap, hold -------------------------------
  let touchStart: { x: number; y: number; element: HTMLElement } | null = null;
  let holdTimer: number | null = null;
  let holdFired = false;
  let suppressContextMenu = false;
  const clearHold = () => {
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = null;
  };

  body.addEventListener(
    'touchstart',
    (e) => {
      holdFired = false;
      clearHold();
      const element = wordAt(e.target);
      if (!element?.dataset.word) {
        touchStart = null;
        return;
      }
      const touch = e.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY, element };
      const hold = handlers.prefs().touchGestures.hold;
      if (hold === 'none') return;
      holdTimer = window.setTimeout(() => {
        if (touchStart?.element !== element) return;
        holdFired = true;
        suppressContextMenu = true;
        handlers.onTouchAction(hold, targetOf(element));
      }, TOUCH_HOLD_MS);
    },
    { passive: true }
  );

  body.addEventListener(
    'touchmove',
    (e) => {
      if (!touchStart) return;
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - touchStart.x) > TOUCH_MOVE_CANCEL_PX || Math.abs(touch.clientY - touchStart.y) > TOUCH_MOVE_CANCEL_PX) {
        clearHold();
        touchStart = null;
      }
    },
    { passive: true }
  );

  body.addEventListener(
    'touchend',
    (e) => {
      clearHold();
      const start = touchStart;
      touchStart = null;
      if (!start) return;
      if (holdFired) {
        e.preventDefault(); // the hold already handled this touch
        return;
      }
      const word = start.element.dataset.word!;
      const now = Date.now();
      const last = gestures.lastTap;
      const isDoubleTap = !!last && last.word === word && now - last.time <= DOUBLE_TAP_WINDOW_MS;
      gestures.lastTap = isDoubleTap ? null : { word, time: now };

      const bindings = handlers.prefs().touchGestures;
      const action = isDoubleTap ? bindings.doubleTap : bindings.singleTap;
      if (action === 'none') return; // the browser's synthetic click opens the full popup
      if (isDoubleTap) handlers.onDoubleTap();
      e.preventDefault();
      handlers.onTouchAction(action, targetOf(start.element));
    },
    { passive: false }
  );

  // Only suppress the native long-press menu for a touch a Hold just handled.
  doc.addEventListener('contextmenu', (e) => {
    if (!suppressContextMenu) return;
    e.preventDefault();
    suppressContextMenu = false;
  });

  // --- Swipe page turns (from anywhere on the page, not just words) ----------
  let swipeStart: { x: number; y: number } | null = null;
  body.addEventListener(
    'touchstart',
    (e) => {
      const touch = e.touches[0];
      swipeStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true }
  );
  body.addEventListener(
    'touchend',
    (e) => {
      const start = swipeStart;
      swipeStart = null;
      const touch = e.changedTouches[0];
      if (!start || !touch || handlers.prefs().readingFlow !== 'paginated') return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;
      if (doc.getSelection()?.toString()) return; // a drag-to-select, not a page turn
      const swipedRight = dx > 0;
      // RTL books: swipe right goes back. LTR books: swipe right goes forward.
      const next = handlers.pageDirection() === 'rtl' ? !swipedRight : swipedRight;
      handlers.onSwipe(next ? 'next' : 'prev');
    },
    { passive: true }
  );
}
