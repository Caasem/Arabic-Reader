import { useSyncExternalStore } from 'react';
import type { DeskItem } from '../studyDesk/types';

/** What the page marks draw (PassageMarks.tsx); the PDF layer is drawn by the pages view and cannot take props. */
interface MarksState {
  passages: DeskItem[];
  /** Show each passage's move: its Arabic label and a coloured underline. */
  moves: boolean;
}
let marks: MarksState = { passages: [], moves: false };
const listeners = new Set<() => void>();
export function publishPassages(passages: DeskItem[], opts: { moves: boolean }): void {
  marks = { passages, ...opts };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useMarks = () => useSyncExternalStore(subscribe, () => marks);
