import { useEffect, useState, useSyncExternalStore } from 'react';
import { bookStrokes, onInkChange } from './inkStore';
import type { InkColor, InkStroke } from './types';

/**
 * What the ink tools are set to, shared by the bar, the layers drawn inside each PDF page (which the pages view
 * renders itself, so they cannot take props), the layer over the clean text, and the sketch panel.
 */
export type InkToolChoice = 'pen' | 'marker' | 'eraser';

export interface InkUi {
  /** Writing on the page: the page takes the pen instead of selecting text or opening the dictionary. */
  inking: boolean;
  tool: InkToolChoice;
  color: InkColor;
  /** Pen width in CSS pixels at the size the page is shown. */
  width: number;
  /** The sketch panel is open, and whether it fills the reader. */
  sketch: boolean;
  full: boolean;
  /** A sheet to show instead of the one for the page on screen (a margin card's Open sketch). */
  openSketch: string | null;
  /** The PDF page being read (published by the pages view's toolbar), for the sketch panel. */
  pdfPage: number | null;
  /** A stylus has been used: from then on fingers scroll and only the pen writes (palm rejection). */
  penSeen: boolean;
  /** How many steps Undo and Redo can take on the page ink. */
  undo: number;
  redo: number;
}

let state: InkUi = { inking: false, tool: 'pen', color: 'ink', width: 2.5, sketch: false, full: false, openSketch: null, pdfPage: null, penSeen: false, undo: 0, redo: 0 };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function setInkUi(patch: Partial<InkUi>): void {
  if (Object.entries(patch).every(([k, v]) => state[k as keyof InkUi] === v)) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const inkUi = (): InkUi => state;
export const useInkUi = (): InkUi => useSyncExternalStore(subscribe, () => state);

/** Which open tool single keys and Ctrl+Z go to: the sketch sheet after a tap inside it, else the page ink. */
export const keyOwner = { sketch: false };

// --- Undo for page ink (this session) ------------------------------------------------------------------
interface Step {
  undo(): Promise<void>;
  redo(): Promise<void>;
}
const done: Step[] = [];
const undone: Step[] = [];
const sync = () => setInkUi({ undo: done.length, redo: undone.length });

export function recordInk(step: Step): void {
  done.push(step);
  if (done.length > 200) done.shift();
  undone.length = 0;
  sync();
}
export async function undoInk(): Promise<void> {
  const step = done.pop();
  if (!step) return;
  await step.undo();
  undone.push(step);
  sync();
}
export async function redoInk(): Promise<void> {
  const step = undone.pop();
  if (!step) return;
  await step.redo();
  done.push(step);
  sync();
}
export function resetInkHistory(): void {
  done.length = 0;
  undone.length = 0;
  sync();
}

// --- The open book's strokes, loaded once for every layer ----------------------------------------------
let cache: { bookId: string; strokes: InkStroke[] } = { bookId: '', strokes: [] };
const cacheListeners = new Set<() => void>();
let loading: string | null = null;

async function load(bookId: string): Promise<void> {
  loading = bookId;
  const strokes = await bookStrokes(bookId);
  if (loading !== bookId) return;
  cache = { bookId, strokes };
  cacheListeners.forEach((l) => l());
}

onInkChange(() => {
  if (cache.bookId) void load(cache.bookId);
});

/** Every stroke written in the book, kept up to date. */
export function useBookStrokes(bookId: string): InkStroke[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    cacheListeners.add(l);
    if (cache.bookId !== bookId && loading !== bookId) void load(bookId);
    return () => void cacheListeners.delete(l);
  }, [bookId]);
  return cache.bookId === bookId ? cache.strokes : [];
}

/** Ink colours on paper (PDF pages stay white in every theme) and on the themed clean text. */
export const PAPER_COLORS: Record<InkColor, string> = { ink: '#1c1b19', brown: '#7a5a32', teal: '#2e7d74', red: '#b3543f' };
export const THEME_COLORS: Record<InkColor, string> = {
  ink: 'var(--ink)',
  brown: 'var(--look-accent-ink, #9c7a4f)',
  teal: 'var(--look-secondary, #2e7d74)',
  red: 'var(--danger, #b3543f)',
};
export const COLOR_NAMES: Record<InkColor, string> = { ink: 'Dark', brown: 'Brown', teal: 'Teal', red: 'Red' };
export const PEN_WIDTHS = [1.5, 2.5, 5];
/** A marker's width in CSS pixels; it is drawn see-through. */
export const MARKER_WIDTH = 14;
