import { useSyncExternalStore } from 'react';
import type { BookMeta } from '../types';
import { readString, removeKey, writeString } from '../utils/storage';

/**
 * What the thinking desk is doing right now, shared by its reader host, its app host and its screens (they load in
 * separate chunks and cannot pass props): the active thread, the passage in the bar, the screen open over the app,
 * a question being hunted, a passage whose touches are shown, and a place to jump to once a book is open.
 */

export type Screen =
  | { kind: 'thread'; id?: string; tab?: ThreadTab }
  | { kind: 'masail' }
  | { kind: 'muqabala'; a?: string; b?: string; link?: string }
  | { kind: 'revisit'; id?: string };

export type ThreadTab = 'document' | 'argument' | 'gathered' | 'masail';

export interface ThinkingState {
  /** The thread new thoughts, moves and masāʾil join (remembered). */
  active: string | null;
  /** The passage (an item id) whose bar is open in the reader. */
  selected: string | null;
  screen: Screen | null;
  /** The question being hunted: the next passage clicked may answer it. */
  hunting: string | null;
  /** The passage whose touches show in the Ḥāshiya strip. */
  touch: string | null;
  /** A place to scroll to once its book is open. */
  jump: { bookId: string; location: string } | null;
}

const ACTIVE_KEY = 'arabic-reader:thinking.activeThread';

let state: ThinkingState = { active: readString(ACTIVE_KEY), selected: null, screen: null, hunting: null, touch: null, jump: null };
const listeners = new Set<() => void>();

export function setThinking(patch: Partial<ThinkingState>): void {
  state = { ...state, ...patch };
  if ('active' in patch) {
    if (patch.active) writeString(ACTIVE_KEY, patch.active);
    else removeKey(ACTIVE_KEY);
  }
  listeners.forEach((l) => l());
}

export const thinkingState = (): ThinkingState => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useThinking = (): ThinkingState => useSyncExternalStore(subscribe, () => state);

/** The book open in the reader, if any (set by the reader host while it is mounted). */
let reading: BookMeta | null = null;
export const setReadingBook = (book: BookMeta | null): void => void (reading = book);
export const readingBook = (): BookMeta | null => reading;

export const openScreen = (screen: Screen): void => setThinking({ screen, selected: null });
export const closeScreen = (): void => setThinking({ screen: null });

/** Tests only. */
export function resetThinkingForTests(): void {
  state = { active: null, selected: null, screen: null, hunting: null, touch: null, jump: null };
}
