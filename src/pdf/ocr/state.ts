import { useSyncExternalStore } from 'react';

/** What the last read of a scanned page did, for the small status chip in the pages view. */
export interface OcrState {
  phase: 'idle' | 'reading' | 'done' | 'none' | 'error';
  engine?: string;
  ms?: number;
  message?: string;
  /** The last read was not a word the dictionary knows. */
  suspect?: boolean;
}

let state: OcrState = { phase: 'idle' };
const listeners = new Set<() => void>();

export function setOcrState(next: OcrState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const getOcrState = (): OcrState => state;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useOcrState = (): OcrState => useSyncExternalStore(subscribe, getOcrState, getOcrState);
