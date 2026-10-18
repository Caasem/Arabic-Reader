import { isBoxRole, type ArgItem } from './roles';

export const BOX_SIZE = { w: 210, h: 92 };
export const COL = 300;
export const ROW = 128;

export interface SheetLayout {
  boxes: ArgItem[];
  /** Top-left of each box. */
  pos: Map<string, { x: number; y: number }>;
  level: Map<string, number>;
  maxLevel: number;
  rows: number;
}

/**
 * level(n) = 0 with no target (or a target that is not a box), else level(target) + 1. Columns run right to
 * left by level; within a column, reading order, ROW px per row. A loop in `for` is broken at the first repeat,
 * which is treated as level 0.
 */
export function layoutSheet(items: readonly ArgItem[]): SheetLayout {
  const byId = new Map(items.map((n) => [n.id, n]));
  const boxes = items.filter((n) => isBoxRole(n.role));
  const level = new Map<string, number>();
  const levelOf = (n: ArgItem, seen: Set<string>): number => {
    const known = level.get(n.id);
    if (known != null) return known;
    if (seen.has(n.id)) return 0;
    seen.add(n.id);
    const t = n.for ? byId.get(n.for) : undefined;
    const l = t && isBoxRole(t.role) ? levelOf(t, seen) + 1 : 0;
    level.set(n.id, l);
    return l;
  };
  boxes.forEach((n) => levelOf(n, new Set()));
  const maxLevel = boxes.reduce((m, n) => Math.max(m, level.get(n.id)!), 0);
  const cols = new Map<number, ArgItem[]>();
  [...boxes].sort((a, b) => a.spot - b.spot).forEach((n) => {
    const l = level.get(n.id)!;
    cols.set(l, [...(cols.get(l) ?? []), n]);
  });
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((arr, l) => arr.forEach((n, i) => pos.set(n.id, { x: 16 + (maxLevel - l) * COL, y: 24 + i * ROW })));
  return { boxes, pos, level, maxLevel, rows: Math.max(1, ...[...cols.values()].map((a) => a.length)) };
}
