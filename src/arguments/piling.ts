import type { DeskItem } from '../studyDesk/types';
import { groupOf, groupPiles, planPileMany, type ItemPatch } from '../studyDesk/piles';
import type { ArgumentRole } from './roles';

const IMPLICIT: ArgumentRole[] = ['warrant', 'backing', 'rebuttal'];

/** A reader's note: an implicit warrant, backing or exception (it has no words on the page). */
export const isImplicit = (i: DeskItem): boolean => !!i.argument?.typed && IMPLICIT.includes(i.argument.role);

/** The claim an item ultimately serves: follow `for` up to an item with none. A loop stops at the first repeat. */
export function rootClaim(id: string, byId: Map<string, DeskItem>): string {
  const seen = new Set<string>();
  let at = id;
  while (!seen.has(at)) {
    seen.add(at);
    const next = byId.get(at)?.argument?.for;
    if (!next || !byId.has(next)) break;
    at = next;
  }
  return at;
}

/**
 * Where a new reader's note goes. Notes for one claim form a pile under that claim's card, so a note joins the pile
 * its claim already has (and sits where that pile sits); otherwise it stands alone beside its own step.
 * `all` is every desk item; returns the patches that join `note` to the pile, or none.
 */
export function pilePlan(note: DeskItem, all: DeskItem[], byId: Map<string, DeskItem>, name: string): ItemPatch[] {
  const claim = rootClaim(note.id, byId);
  const mates = all.filter((i) => i.id !== note.id && isImplicit(i) && rootClaim(i.id, byId) === claim);
  if (!mates.length) return [];
  const piles = groupPiles(all);
  const first = groupOf(mates[0], piles);
  const group = first.length > 1 ? first : [mates[0]];
  // Other notes of the claim that are not in this pile yet come along.
  const rest = mates.filter((m) => !group.some((g) => g.id === m.id)).map((m) => [m]);
  const place = group[0].pin ?? null;
  const patches = planPileMany([group, ...rest, [note]], place);
  // The pile is named after its claim unless the reader already named it.
  return patches.map((p) => (group[0].pile?.name ? p : { ...p, patch: { ...p.patch, pile: { ...p.patch.pile!, name } } }));
}
