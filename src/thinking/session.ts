import { useEffect } from 'react';
import { parsePdfLocation, pdfLocationNearCentre } from '../studyDesk/pageGeometry';
import { onItemAdded } from '../studyDesk/deskStore';
import { currentTrip } from '../studyDesk/trip';
import type { DeskItem } from '../studyDesk/types';
import type { BookMeta } from '../types';
import { thinkingState } from './state';
import { joinsActiveThread } from './threads';
import type { Made } from './today';

/**
 * The reading session of one reader visit (docs/features/thinking-front.md, the closing prompt): while a book is open
 * it counts minutes of active reading, the PDF pages seen and what was made. Book switches inside a visit are one
 * session, journalled under the book open at the end. When the reader closes, it waits in `ended` for the closing sheet.
 */

export interface EndedSession {
  bookId: string;
  bookTitle: string;
  pages: number;
  minutes: number;
  made: Made;
  endedAt: number;
}

const TICK = 15_000;
const PAGE_EVERY = 5_000;
/** Input or scroll within this long counts as reading. */
const IDLE = 2 * 60_000;
/** A host that unmounts and mounts again straight away (PDF to text book) is still the same visit. */
const GRACE = 1_500;

interface Tally {
  bookId: string;
  bookTitle: string;
  activeMs: number;
  pages: Set<number>;
  made: Made;
}

const noMade = (): Made => ({ moves: 0, thoughts: 0, questions: 0, threaded: 0 });

let tally: Tally | null = null;
/** Stopped but not yet published: the grace period, or a capture trip (which never ends a visit). */
let held: { tally: Tally; timer: number | null; at: number } | null = null;
let ended: EndedSession | null = null;
let stopCounting: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribeSession = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** The session that ended and waits to be asked about, if any. */
export const endedSession = (): EndedSession | null => ended;
/** The reader answered, or opened a book again. */
export function clearEnded(): void {
  if (!ended) return;
  ended = null;
  emit();
}

/** A move set on a passage that already exists goes through updateItem, which has no listener: the caller says so. */
export function countMove(): void {
  if (tally) tally.made.moves++;
}

function count(item: DeskItem): void {
  if (!tally) return;
  const made = tally.made;
  if (item.move) made.moves++;
  if (item.type === 'note' || item.type === 'line') made.thoughts++;
  if (item.type === 'question') made.questions++;
  if (thinkingState().active && joinsActiveThread(item)) made.threaded++;
}

function startCounting(t: Tally): () => void {
  let lastInput = Date.now();
  let lastTick = lastInput;
  const touch = () => void (lastInput = Date.now());
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'pointermove'] as const;
  for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });

  const tick = window.setInterval(() => {
    const now = Date.now();
    // A timer that slept (a closed laptop) must not count the gap: at most one tick's worth per check.
    const elapsed = Math.min(now - lastTick, TICK * 2);
    lastTick = now;
    if (document.visibilityState === 'visible' && now - lastInput <= IDLE) t.activeMs += elapsed;
  }, TICK);

  const sample = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const page = parsePdfLocation(pdfLocationNearCentre() ?? undefined)?.page;
    if (page) t.pages.add(page);
  }, PAGE_EVERY);

  const off = onItemAdded(count);
  return () => {
    for (const e of events) window.removeEventListener(e, touch, { capture: true });
    window.clearInterval(tick);
    window.clearInterval(sample);
    off();
  };
}

/** A book is open: begin a session, or carry on the one this visit already has. */
export function startVisit(book: BookMeta): void {
  if (ended) clearEnded();
  if (!tally && held) {
    // Resume what was held for the grace period, or across a capture trip that is still on (or only just over).
    const fresh = held.timer !== null || currentTrip() !== null || Date.now() - held.at < GRACE;
    if (held.timer !== null) window.clearTimeout(held.timer);
    tally = fresh ? held.tally : null;
    held = null;
  }
  if (!tally) tally = { bookId: book.id, bookTitle: book.title, activeMs: 0, pages: new Set(), made: noMade() };
  tally.bookId = book.id;
  tally.bookTitle = book.title;
  if (!stopCounting) stopCounting = startCounting(tally);
}

function publish(t: Tally): void {
  ended = {
    bookId: t.bookId,
    bookTitle: t.bookTitle,
    pages: t.pages.size,
    minutes: Math.floor(t.activeMs / 60_000),
    made: t.made,
    endedAt: Date.now(),
  };
  emit();
}

/** The reader closed (or the host went away): publish after a moment, unless a capture trip is on. */
export function endVisit(): void {
  if (!tally) return;
  const t = tally;
  tally = null;
  stopCounting?.();
  stopCounting = null;
  if (currentTrip()) {
    // A capture trip goes into another book and comes back; it never asks.
    held = { tally: t, timer: null, at: Date.now() };
    return;
  }
  const timer = window.setTimeout(() => {
    held = null;
    publish(t);
  }, GRACE);
  held = { tally: t, timer, at: Date.now() };
}

/** Counts the visit while the book is open, and ends it when the reader host unmounts. */
export function useReadingSession(book: BookMeta): void {
  useEffect(() => {
    startVisit(book);
  }, [book]);
  useEffect(() => endVisit, []);
}

/** Tests only. */
export function resetSessionForTests(): void {
  stopCounting?.();
  if (held?.timer) window.clearTimeout(held.timer);
  tally = null;
  held = null;
  ended = null;
  stopCounting = null;
}
