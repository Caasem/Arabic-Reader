import { useSyncExternalStore, type ComponentType } from 'react';

/**
 * Rows a feature adds to the reader's selection bar (the bar over selected text, with the five highlight colours). The
 * argument layer adds its eight roles here, so there is one palette for every kind of mark. A feature registers a
 * component while it is on and removes it when it goes.
 */
let extras: { id: string; Row: ComponentType }[] = [];
const listeners = new Set<() => void>();

export function registerSelectionExtra(id: string, Row: ComponentType): () => void {
  extras = [...extras.filter((e) => e.id !== id), { id, Row }];
  listeners.forEach((l) => l());
  return () => {
    extras = extras.filter((e) => e.id !== id);
    listeners.forEach((l) => l());
  };
}

export const useSelectionExtras = (): { id: string; Row: ComponentType }[] =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => extras
  );
