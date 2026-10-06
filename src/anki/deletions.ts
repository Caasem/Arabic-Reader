import type { VocabularyItem } from '../types';

/**
 * Anki notes whose cards were removed in the app, waiting for the next Anki sync. Kept per device
 * in localStorage: Anki is reached from this device, and losing the list only means a removed
 * card's note stays in Anki (the reader can delete it there).
 */
const KEY = 'anki.pendingDeletes';

export function pendingAnkiDeletes(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export function rememberAnkiDeletes(items: (VocabularyItem | undefined)[]): void {
  const ids = items.map((i) => i?.ankiNoteId).filter((n): n is number => typeof n === 'number');
  if (!ids.length) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...pendingAnkiDeletes(), ...ids])]));
  } catch {
    // Storage blocked: the note simply stays in Anki.
  }
}

export function clearAnkiDeletes(ids: number[]): void {
  const done = new Set(ids);
  try {
    localStorage.setItem(KEY, JSON.stringify(pendingAnkiDeletes().filter((n) => !done.has(n))));
  } catch {
    // Nothing to do.
  }
}
