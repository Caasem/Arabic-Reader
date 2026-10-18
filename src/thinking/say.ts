import { useSyncExternalStore } from 'react';

/** One message at a time for the whole thinking desk, with Undo when there is something to undo. Uses the study desk's toast look. */
interface Toast {
  text: string;
  undo?: () => Promise<void> | void;
  at: number;
}

let current: Toast | null = null;
const listeners = new Set<() => void>();
let timer = 0;

function set(t: Toast | null) {
  current = t;
  listeners.forEach((l) => l());
}

export function say(text: string, undo?: () => Promise<void> | void): void {
  window.clearTimeout(timer);
  set({ text, undo, at: Date.now() });
  timer = window.setTimeout(() => set(null), undo ? 6000 : 2400);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useToast = (): Toast | null => useSyncExternalStore(subscribe, () => current);

export function runUndo(): void {
  const undo = current?.undo;
  set(null);
  if (undo) void Promise.resolve(undo()).then(() => say('Undone'));
}
