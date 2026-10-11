import type { VocabularyItem } from '../types';
import { readJSON, writeJSON } from '../utils/storage';

/**
 * Anki notes whose cards were removed in the app, waiting for the next Anki sync. Kept per device
 * in localStorage: Anki is reached from this device, and losing the list only means a removed
 * card's note stays in Anki (the reader can delete it there).
 */
const KEY = 'anki.pendingDeletes';

export function pendingAnkiDeletes(): number[] {
  const raw = readJSON<unknown>(KEY);
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
}

/** Storage blocked: the note simply stays in Anki. */
export function rememberAnkiDeletes(items: (VocabularyItem | undefined)[]): void {
  const ids = items.map((i) => i?.ankiNoteId).filter((n): n is number => typeof n === 'number');
  if (!ids.length) return;
  writeJSON(KEY, [...new Set([...pendingAnkiDeletes(), ...ids])]);
}

export function clearAnkiDeletes(ids: number[]): void {
  const done = new Set(ids);
  writeJSON(KEY, pendingAnkiDeletes().filter((n) => !done.has(n)));
}
