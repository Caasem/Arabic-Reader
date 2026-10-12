import { readString, writeString } from '../utils/storage';
import type { PullTarget } from './pullIn';

/**
 * What the study desk remembers on this device (small conveniences that may safely be lost). The key strings
 * predate the registry and must not change: values saved earlier read back through these.
 */
const DOC_PANEL_MIN_KEY = 'studyDesk.docPanelMin';
const LAST_MARGINS_KEY = 'studyDesk.lastMargins';
const PULL_TARGET_KEY = 'studyDesk.pullTarget';
const SNAP_KEY = 'studyDesk.pdfSnap';
const currentKey = (bookId: string) => `studyDesk.current.${bookId}`;

export type MarginsSide = 'left' | 'right' | 'both';

/** Whether the desk document's side panel was minimised ('1'); open when nothing is stored. */
export function docPanelMinimised(): boolean {
  return readString(DOC_PANEL_MIN_KEY) === '1';
}

export function rememberDocPanelMinimised(min: boolean): void {
  writeString(DOC_PANEL_MIN_KEY, min ? '1' : '0');
}

/** The margins layout in force before Alt+M hid them, or null when none was kept (both sides then). */
export function lastMargins(): MarginsSide | null {
  const v = readString(LAST_MARGINS_KEY);
  return v === 'left' || v === 'right' || v === 'both' ? v : null;
}

export function rememberLastMargins(m: MarginsSide): void {
  writeString(LAST_MARGINS_KEY, m);
}

/** Where Pull in files its capture, as last chosen; the right margin when nothing valid is stored. */
export function pullTarget(): PullTarget {
  const v = readString(PULL_TARGET_KEY);
  return v === 'left' || v === 'right' || v === 'inbox' ? v : 'right';
}

export function rememberPullTarget(t: PullTarget): void {
  writeString(PULL_TARGET_KEY, t);
}

/** Whether a dragged PDF region snaps to the words under it: on unless it was switched off. */
export function snapEnabled(): boolean {
  return readString(SNAP_KEY) !== 'off';
}

export function setSnapEnabled(on: boolean): void {
  writeString(SNAP_KEY, on ? 'on' : 'off');
}

/** The desk captures go to while a book is open: the id last chosen for it, or null (the book's own desk). */
export function currentDeskId(bookId: string): string | null {
  return readString(currentKey(bookId));
}

export function rememberCurrentDeskId(bookId: string, deskId: string): void {
  writeString(currentKey(bookId), deskId);
}
