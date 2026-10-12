import { useSyncExternalStore } from 'react';
import type { DeskItem } from '../studyDesk/types';

/** What the page marks draw (PassageMarks.tsx); the PDF layer is drawn by the pages view and cannot take props. */
interface MarksState {
  passages: DeskItem[];
  /** Show each passage's move: its Arabic label and a coloured underline. */
  moves: boolean;
  /** How many things touch each passage (backlinks), when shown. */
  counts: Map<string, number>;
}
let marks: MarksState = { passages: [], moves: false, counts: new Map() };
const listeners = new Set<() => void>();
export function publishPassages(passages: DeskItem[], opts: { moves: boolean; counts: Map<string, number> }): void {
  marks = { passages, ...opts };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useMarks = () => useSyncExternalStore(subscribe, () => marks);
