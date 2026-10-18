import type { ReaderPreferences } from '../types';
import type { DeskItem } from '../studyDesk/types';

/** The argument layer's layers. Each works alone: none needs another to be open. */
export interface Layers {
  marks: boolean;
  cards: boolean;
  sheet: 'off' | 'side' | 'full';
  /** Which reader's notes show as cards in the margin. */
  warrants: boolean;
  backings: boolean;
  exceptions: boolean;
}

export const DEFAULT_LAYERS: Layers = { marks: true, cards: true, sheet: 'off', warrants: true, backings: true, exceptions: true };

export const layersOf = (p: Pick<ReaderPreferences, 'argumentsMarks' | 'argumentsCards' | 'argumentsSheet' | 'argumentsWarrants' | 'argumentsBackings' | 'argumentsExceptions'>): Layers => ({
  marks: p.argumentsMarks,
  cards: p.argumentsCards,
  sheet: p.argumentsSheet,
  warrants: p.argumentsWarrants,
  backings: p.argumentsBackings,
  exceptions: p.argumentsExceptions,
});

/** Whether an item's margin card shows. Items that are not argument items are never hidden by these layers. */
export function cardShown(item: Pick<DeskItem, 'argument'>, layers: Layers): boolean {
  const a = item.argument;
  if (!a) return true;
  if (!layers.cards) return false;
  if (!a.typed) return true;
  if (a.role === 'warrant') return layers.warrants;
  if (a.role === 'backing') return layers.backings;
  if (a.role === 'rebuttal') return layers.exceptions;
  return true;
}
