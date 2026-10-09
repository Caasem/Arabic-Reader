import { newId } from '../utils/id';
import type { DeskItem, DeskPin } from './types';

/**
 * Piles of margin cards (MarginLayer.tsx): drop a card on another and it goes underneath; the card dropped on
 * stays on top. A pile lives in its members' `pile` field (types.ts). These functions only plan the changes, as
 * patches for deskStore.patchItems, so the same patches turned around (undoPatches) undo them.
 */

export interface ItemPatch {
  id: string;
  patch: Partial<Omit<DeskItem, 'id' | 'createdAt'>>;
}

/** Colour tabs offered for a pile. Mid tones, readable on light and dark pages. */
export const PILE_COLOURS: { name: string; value: string }[] = [
  { name: 'Green', value: '#4f7a5a' },
  { name: 'Blue', value: '#4a6f96' },
  { name: 'Rose', value: '#a65a5a' },
  { name: 'Ochre', value: '#a8822f' },
  { name: 'Plum', value: '#7a5a8c' },
];

const byOrder = (a: DeskItem, b: DeskItem) => (a.pile?.order ?? 0) - (b.pile?.order ?? 0) || a.createdAt - b.createdAt;

/** The piles among these items, by id, each top card first. A pile of one is left out: it is shown as a lone card. */
export function groupPiles(items: DeskItem[]): Map<string, DeskItem[]> {
  const all = new Map<string, DeskItem[]>();
  for (const item of items) {
    if (!item.pile) continue;
    const list = all.get(item.pile.id);
    if (list) list.push(item);
    else all.set(item.pile.id, [item]);
  }
  for (const [id, list] of all) {
    if (list.length < 2) all.delete(id);
    else list.sort(byOrder);
  }
  return all;
}

/** An item's pile, top first, or the item alone. */
export function groupOf(item: DeskItem, piles: Map<string, DeskItem[]>): DeskItem[] {
  return (item.pile && piles.get(item.pile.id)) || [item];
}

/** Under another card: in a pile and not its top. */
export function isBeneath(item: DeskItem, piles: Map<string, DeskItem[]>): boolean {
  const group = item.pile && piles.get(item.pile.id);
  return !!group && group[0].id !== item.id;
}

function lay(members: DeskItem[], id: string, name: string | undefined, color: string | undefined, moved: Set<string>, place: DeskPin | null): ItemPatch[] {
  return members.map((m, order) => ({
    id: m.id,
    patch: { pile: { id, order, ...(name ? { name } : {}), ...(color ? { color } : {}) }, ...(place && moved.has(m.id) ? { pin: place } : {}) },
  }));
}

/**
 * `dragged` (a card, or a pile top first) dropped on `target` (the same): the target's top card stays on top and
 * the dragged cards go beneath it, at the bottom. They move to `place`, the target's place on the page, so the
 * pile is all in one spot. The pile keeps the target's name and tab, or takes the dragged pile's.
 */
export function planPile(target: DeskItem[], dragged: DeskItem[], place: DeskPin | null): ItemPatch[] {
  return planPileMany([target, dragged], place);
}

/** Cards and piles, in the order they sit (the first on top), made into one pile at `place`. */
export function planPileMany(groups: DeskItem[][], place: DeskPin | null): ItemPatch[] {
  const seen = new Set<string>();
  const members = groups.flat().filter((m) => !seen.has(m.id) && seen.add(m.id));
  if (members.length < 2) return [];
  const named = groups.map((g) => g[0].pile).find((p) => p && (p.name || p.color));
  const id = groups[0][0].pile?.id ?? newId('pile');
  const moved = new Set(groups.slice(1).flat().map((m) => m.id));
  return lay(members, id, named?.name, named?.color, moved, place);
}

/** One card off its pile, to `pin` if given. A pile left with one card is no pile any more. */
export function planUnpile(group: DeskItem[], itemId: string, pin?: DeskPin): ItemPatch[] {
  const rest = group.filter((m) => m.id !== itemId);
  const out: ItemPatch[] = [{ id: itemId, patch: { pile: undefined, ...(pin ? { pin } : {}) } }];
  if (rest.length === 1) out.push({ id: rest[0].id, patch: { pile: undefined } });
  else if (rest.length > 1) {
    const p = rest[0].pile!;
    out.push(...lay(rest, p.id, p.name, p.color, new Set(), null));
  }
  return out;
}

/** A pile named (an empty name clears it) and given a colour tab (or none). */
export function planName(group: DeskItem[], name: string, color: string | undefined): ItemPatch[] {
  const p = group[0].pile;
  if (!p || group.length < 2) return [];
  return lay(group, p.id, name.trim() || undefined, color || undefined, new Set(), null);
}

/** The patches that put back what `patches` change, from the items as they are before. */
export function undoPatches(before: DeskItem[], patches: ItemPatch[]): ItemPatch[] {
  const byId = new Map(before.map((i) => [i.id, i]));
  return patches.flatMap(({ id, patch }) => {
    const was = byId.get(id);
    if (!was) return [];
    const back: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) back[key] = (was as unknown as Record<string, unknown>)[key];
    return [{ id, patch: back as ItemPatch['patch'] }];
  });
}

/** How many cards of a pile come from other books (shown as source chips and under the pile). */
export function fromOtherBooks(group: DeskItem[], bookId: string): number {
  return group.filter((m) => m.source && m.source.bookId !== bookId).length;
}

/** A card's words for a toast, kept short. */
export function shortLabel(item: DeskItem): string {
  const t = (item.text || item.body?.split('\n')[0] || (item.imageHash ? 'Screenshot' : 'note')).trim();
  return t.length > 28 ? t.slice(0, 28) + '…' : t;
}
