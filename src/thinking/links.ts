import type { DeskItem } from '../studyDesk/types';
import { isThought, thoughtText } from './passages';

/** Linking one thought to another, after it was written (docs/features/thinking-front.md). Links are kept on both thoughts. */

/** Thoughts (from any book) whose words contain what was typed, up to `max`; not those in `exclude`. */
export function findThoughts(items: DeskItem[], query: string, exclude: string[], max = 5): DeskItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((i) => isThought(i) && !exclude.includes(i.id) && thoughtText(i).toLowerCase().includes(q)).slice(0, max);
}

/** The patches (for `patchItems`) that link or unlink two thoughts: each lists the other, once. */
export function linkPatches(a: DeskItem, b: DeskItem, link: boolean): { id: string; patch: Pick<DeskItem, 'links'> }[] {
  const of = (x: DeskItem, other: string): string[] => {
    const rest = (x.links ?? []).filter((id) => id !== other);
    return link ? [...rest, other] : rest;
  };
  return [
    { id: a.id, patch: { links: of(a, b.id) } },
    { id: b.id, patch: { links: of(b, a.id) } },
  ];
}

/** Undo of `linkPatches`: both thoughts back as they were (a missing `links` clears the field). */
export const unlinkedPatches = (a: DeskItem, b: DeskItem): { id: string; patch: Pick<DeskItem, 'links'> }[] => [
  { id: a.id, patch: { links: a.links } },
  { id: b.id, patch: { links: b.links } },
];
