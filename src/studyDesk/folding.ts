import { patchItems } from './deskStore';
import type { RingAction } from './MarginRing';
import type { DeskItem } from './types';

/**
 * Folding margin cards to one-line chips (MarginLayer's Gloss): every card on screen at once, from the margin's
 * ring or with [ (fold) and ] (open) while not typing. A pile folds and opens as one: its top card decides.
 */

export async function foldAll(items: DeskItem[], collapsed: boolean): Promise<void> {
  await patchItems(items.filter((i) => i.collapsed !== collapsed).map((i) => ({ id: i.id, patch: { collapsed } })));
}

/** The ring's button, given the cards now on screen and whether each shows folded: Fold all while any is open. */
export function foldActions(onScreen: () => DeskItem[], folded: (i: DeskItem) => boolean): RingAction[] {
  const cards = onScreen();
  if (!cards.length) return [];
  const anyOpen = cards.some((i) => !folded(i));
  return [anyOpen ? { id: 'fold', label: 'Fold all cards', keys: '[', run: () => void foldAll(cards, true) } : { id: 'unfold', label: 'Open all cards', keys: ']', run: () => void foldAll(cards, false) }];
}

/** [ and ] for the cards on screen, while no text field has the keys. */
export function foldKeys(onScreen: () => DeskItem[]): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== '[' && e.key !== ']')) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"], .sk-panel')) return;
    e.preventDefault();
    void foldAll(onScreen(), e.key === '[');
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
