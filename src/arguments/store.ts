import { useSyncExternalStore } from 'react';
import type { BookMeta } from '../types';
import type { DeskItem } from '../studyDesk/types';
import type { ArgumentRole } from './roles';
import type { ArgItem } from './roles';
import { DEFAULT_LAYERS, type Layers } from './layers';

/**
 * What the argument layer shares between its host (which reads the desk) and the cards in the margin (which the study
 * desk's MarginLayer draws): the book's argument items, their numbers, and the one-shot "tie to words" and "write a note"
 * states. A tiny external store, so the cards need no props from the desk.
 */
export interface ArgState {
  book: BookMeta | null;
  /** Every desk item of this book that carries an argument. */
  mine: DeskItem[];
  items: ArgItem[];
  byId: Map<string, DeskItem>;
  nums: Map<string, number>;
  /** A margin note waiting for the next selection to become its words. */
  tie: string | null;
  /** A card with its inline input open, to write an implicit note. */
  add: { id: string; role: Extract<ArgumentRole, 'warrant' | 'backing' | 'rebuttal'> } | null;
  deskId: string | null;
  layers: Layers;
  /** Applies a role to the words selected in the page (set by the host; used by the selection bar's role row). */
  applyRole: ((role: ArgumentRole) => void) | null;
}

const empty: ArgState = { book: null, mine: [], items: [], byId: new Map(), nums: new Map(), tie: null, add: null, deskId: null, layers: DEFAULT_LAYERS, applyRole: null };
let state = empty;
const listeners = new Set<() => void>();

export function setArg(patch: Partial<ArgState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const resetArg = (): void => setArg({ ...empty });

export const argState = (): ArgState => state;

export const useArg = (): ArgState => useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => state);

export const useArgLayers = (): Layers => useArg().layers;

/** Undo steps for everything the layer does, newest last. */
const undoStack: (() => Promise<void>)[] = [];
export const pushUndo = (fn: () => Promise<void>): void => void undoStack.push(fn);
export const popUndo = (): (() => Promise<void>) | undefined => undoStack.pop();
