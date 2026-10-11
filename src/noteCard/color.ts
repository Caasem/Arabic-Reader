import type { HighlightColor } from '../types';
import { readString, writeString } from '../utils/storage';

export const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];
/** The note colour last picked (this device). The key string predates the registry and must not change. */
const COLOR_KEY = 'noteCard.color';

export function loadColor(): HighlightColor {
  const raw = readString(COLOR_KEY);
  return COLORS.includes(raw as HighlightColor) ? (raw as HighlightColor) : 'yellow';
}

export function saveColor(color: HighlightColor): void {
  writeString(COLOR_KEY, color);
}
