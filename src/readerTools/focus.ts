import { useSyncExternalStore } from 'react';
import { loadCleanFocus, saveCleanFocus } from '../readerCore/cleanFocus';
import type { ReaderKind } from './tools';

/**
 * Focus, shared by the quiet reader and the PDF pages: one switch (remembered, as Focus always was), one
 * pill, one tool rail. Each reader hides its own chrome while it is on and says where the reader is.
 */
interface FocusState {
  on: boolean;
  /** The tool rail beside the page (Alt twice, or Tools in the pill). */
  rail: boolean;
  /** Where the reader is, for the pill ("Page 3 of 12", "Page 4 of 9 · 38%"). */
  where: string;
  /** The reader showing, or null for one without Focus (the original epub layout). */
  reader: ReaderKind | null;
}

let state: FocusState = { on: loadCleanFocus(), rail: false, where: '', reader: null };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
function set(patch: Partial<FocusState>): void {
  if (Object.entries(patch).every(([k, v]) => state[k as keyof FocusState] === v)) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const readerFocus = (): FocusState => state;
export const useReaderFocus = (): FocusState => useSyncExternalStore(subscribe, () => state);

export function setReaderFocus(on: boolean): void {
  if (on !== state.on) saveCleanFocus(on);
  set({ on, rail: on ? state.rail : false });
}
export const setFocusRail = (rail: boolean): void => set({ rail: state.on && rail });
export const setFocusWhere = (where: string): void => set({ where });
export const setFocusReader = (reader: ReaderKind | null): void => set({ reader });
