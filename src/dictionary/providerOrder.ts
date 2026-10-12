/**
 * Puts providers in the user's chosen order (Settings -> Dictionaries). Ids in
 * `order` come first, in that order; any provider not mentioned (a newly
 * registered one) follows in registration order; unknown ids are ignored.
 */
export function orderProviders<T extends { id: string }>(providers: T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return providers
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (rank.get(a.p.id) ?? Infinity) - (rank.get(b.p.id) ?? Infinity) || a.i - b.i)
    .map((x) => x.p);
}

/**
 * A new full order after the ids in `subset` (e.g. the dictionaries that have an entry, shown as tabs) were
 * rearranged: the slots those ids held in `fullIds` are refilled with `subset`'s new order, every other id
 * stays where it was.
 */
export function reorderSubset(fullIds: readonly string[], subset: readonly string[]): string[] {
  const inSubset = new Set(subset);
  const queue = subset.filter((id) => fullIds.includes(id));
  let i = 0;
  return fullIds.map((id) => (inSubset.has(id) ? (queue[i++] ?? id) : id));
}

/** The ids after moving `id` one place up (-1) or down (+1) in the displayed order. */
export function moveProviderId(displayedIds: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = [...displayedIds];
  const from = next.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
