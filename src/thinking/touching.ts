import type { DeskItem, DeskLink } from '../studyDesk/types';
import { isThought, onPassage } from './passages';

/**
 * Everything that touches a passage (the backlinks badge, and "Touching this passage" in the Ḥāshiya strip): the gloss
 * written on it, thoughts at its place, thoughts linked to those (from any book), masāʾil asked on it or answered by it,
 * and Muqābala links.
 */
export type Touch =
  | { kind: 'gloss'; item: DeskItem }
  | { kind: 'thought'; item: DeskItem; via?: DeskItem }
  | { kind: 'question'; item: DeskItem; answers: boolean }
  | { kind: 'link'; link: DeskLink; other: DeskItem };

export function touching(passage: DeskItem, items: DeskItem[], links: DeskLink[], byId: Map<string, DeskItem>): Touch[] {
  const out: Touch[] = [];
  const seen = new Set<string>([passage.id]);
  if (passage.body?.trim()) out.push({ kind: 'gloss', item: passage });
  const on = items.filter((i) => !seen.has(i.id) && isThought(i) && onPassage(i, passage));
  for (const t of on) {
    seen.add(t.id);
    out.push({ kind: 'thought', item: t });
  }
  // Thoughts linked to those, and to the gloss (links are kept on both sides).
  for (const from of [passage, ...on]) {
    for (const id of from.links ?? []) {
      const t = byId.get(id);
      if (!t || seen.has(t.id) || !isThought(t)) continue;
      seen.add(t.id);
      out.push({ kind: 'thought', item: t, via: from });
    }
  }
  for (const q of items) {
    if (q.type !== 'question' || seen.has(q.id)) continue;
    const answers = q.answer === passage.id;
    if (answers || q.tie === passage.id || (!!q.source?.location && onPassage(q, passage))) {
      seen.add(q.id);
      out.push({ kind: 'question', item: q, answers });
    }
  }
  for (const link of links) {
    if (link.a !== passage.id && link.b !== passage.id) continue;
    const other = byId.get(link.a === passage.id ? link.b : link.a);
    if (other) out.push({ kind: 'link', link, other });
  }
  return out;
}

/** How many things touch each passage, for the badges (passages nothing touches are left out). */
export function touchCounts(passages: DeskItem[], items: DeskItem[], links: DeskLink[], byId: Map<string, DeskItem>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of passages) {
    const n = touching(p, items, links, byId).length;
    if (n) counts.set(p.id, n);
  }
  return counts;
}
