import { useSyncExternalStore } from 'react';
import type { DeskItem } from '../studyDesk/types';

/** The passages the page marks draw (PassageMarks.tsx); the PDF layer is drawn by the pages view and cannot take props. */
interface MarksState {
  passages: DeskItem[];
}
let marks: MarksState = { passages: [] };
const listeners = new Set<() => void>();
export function publishPassages(passages: DeskItem[]): void {
  marks = { passages };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useMarks = () => useSyncExternalStore(subscribe, () => marks);
