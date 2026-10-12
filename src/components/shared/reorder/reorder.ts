/** `ids` with `id` moved so it sits at `index` (clamped to the ends). Unknown id: unchanged copy. */
export function moveToIndex<T>(ids: readonly T[], id: T, index: number): T[] {
  const next = [...ids];
  const from = next.indexOf(id);
  if (from === -1) return next;
  const to = Math.max(0, Math.min(next.length - 1, index));
  if (to === from) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Where a dragged item would land: how many of the *other* items sit before the pointer in reading
 * order. `midpoints` are the other items' centres along the drag axis, in their current order;
 * `before(mid)` says whether that centre lies before the pointer. Counting the others (not hit-testing
 * the row under the pointer) keeps the result stable when the rows differ in size.
 */
export function dropIndex(midpoints: readonly number[], before: (mid: number) => boolean): number {
  let n = 0;
  for (const mid of midpoints) if (before(mid)) n++;
  return n;
}
