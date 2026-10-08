import { useSyncExternalStore } from 'react';
import type { OpenedPdf } from '../pdf/pages/pdfjsLoader';
import { parsePdfLocation } from './pageGeometry';
import type { DeskItem } from './types';

/**
 * Shared between the boxes drawn inside each PDF page (PdfDeskLayer, a pages-view extension that the pages
 * view renders itself, so it cannot take props) and the margin beside the pages (PdfMargin, mounted by the
 * desk host): the desk items and which one the pointer is on.
 */
interface PdfDeskState {
  items: DeskItem[];
  hover: string | null;
  /** A card to focus once it shows (a gloss just started from the page). */
  focus: string | null;
  /** A margin note waiting to be tied to words dragged over on the page (Tie to words). */
  tie: string | null;
  /** The open PDF, for reading scanned pages (published by the page layer, which the pages view hands it). */
  opened: OpenedPdf | null;
}

let state: PdfDeskState = { items: [], hover: null, focus: null, tie: null, opened: null };
const listeners = new Set<() => void>();

function set(patch: Partial<PdfDeskState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const publishPdfDeskItems = (items: DeskItem[]): void => set({ items });
export const setPdfDeskHover = (hover: string | null): void => {
  if (state.hover !== hover) set({ hover });
};
export const setPdfDeskFocus = (focus: string | null): void => set({ focus });
export const setPdfDeskTie = (tie: string | null): void => set({ tie });
export const publishOpenedPdf = (opened: OpenedPdf | null): void => {
  if (state.opened !== opened) set({ opened });
};
export const pdfDeskState = (): PdfDeskState => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const usePdfDesk = (): PdfDeskState => useSyncExternalStore(subscribe, () => state);

export interface PdfMark {
  item: DeskItem;
  page: number;
  /** Fractions of the page. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The items with a region or a level on a page of this book (one page, or all when `page` is omitted), in reading order. */
export function pdfMarks(items: DeskItem[], bookId: string, page?: number): PdfMark[] {
  const out: PdfMark[] = [];
  for (const item of items) {
    if (item.hidden && !item.pin) continue;
    const location = item.pin?.bookId === bookId ? item.pin.location : item.source?.bookId === bookId ? item.source.location : undefined;
    const at = parsePdfLocation(location);
    // A captured region has a box; a margin note's place is a level (height 0).
    if (!at || (page !== undefined && at.page !== page) || at.w <= 0 || at.h < 0) continue;
    out.push({ item, ...at });
  }
  return out.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/** Card tops (px), each level with its region where room allows, never overlapping. */
export function stackTops(wanted: number[], heights: number[], gap = 8): number[] {
  let bottom = -Infinity;
  return wanted.map((y, i) => {
    const top = Math.max(y, bottom);
    bottom = top + heights[i] + gap;
    return top;
  });
}
