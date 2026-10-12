import { readJSON, writeJSON } from '../utils/storage';

export interface Pos {
  x: number;
  y: number;
}

/**
 * Where a floating card was left last (this device). The key is the caller's (`posKey` on FloatingCard): the note
 * card uses 'noteCard.floatingPos' and the flashcard 'flashCard.floatingPos'. These strings predate the registry and
 * must not change.
 */
export function loadPos(key: string): Pos | null {
  return readJSON<Pos>(key);
}

/** Remembering the position is a nicety: it is lost quietly if storage is unavailable. */
export function savePos(key: string, pos: Pos): void {
  writeJSON(key, pos);
}
