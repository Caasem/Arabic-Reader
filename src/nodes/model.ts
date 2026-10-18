import type { CardRec, Kid, NodeAnchor, NodeKid, NodeRec, NodeStyle, Offset } from './types';

/** Everything stored for one book. */
export interface Rows {
  nodes: NodeRec[];
  cards: CardRec[];
}

const bySibling = (a: { order: number; createdAt: number }, b: { order: number; createdAt: number }) => a.order - b.order || a.createdAt - b.createdAt;

/** The tree: top-level nodes in order, each with what hangs from it. Rows that lead nowhere (a missing parent, a loop) are left out. */
export function buildTree(rows: Rows): NodeKid[] {
  const nodesOf = new Map<string, NodeRec[]>();
  const cardsOf = new Map<string, CardRec[]>();
  const tops: NodeRec[] = [];
  for (const n of rows.nodes) {
    if (n.parentId === null) tops.push(n);
    else nodesOf.set(n.parentId, [...(nodesOf.get(n.parentId) ?? []), n]);
  }
  for (const c of rows.cards) cardsOf.set(c.parentId, [...(cardsOf.get(c.parentId) ?? []), c]);

  const seen = new Set<string>();
  const make = (node: NodeRec): NodeKid => {
    seen.add(node.id);
    const kids: Kid[] = [
      ...(nodesOf.get(node.id) ?? []).filter((n) => !seen.has(n.id)).map((n): [number, number, Kid] => [n.order, n.createdAt, make(n)]),
      ...(cardsOf.get(node.id) ?? []).map((c): [number, number, Kid] => [c.order, c.createdAt, { type: 'card', card: c }]),
    ]
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map((k) => k[2]);
    return { type: 'node', node, kids };
  };
  return tops.sort(bySibling).map(make);
}

/** How many nodes and cards hang below a node, at any depth. */
export function countBelow(k: NodeKid): number {
  return k.kids.reduce((sum, c) => sum + 1 + (c.type === 'node' ? countBelow(c) : 0), 0);
}

/** The ids of a node and every node below it. */
export function subtreeIds(rows: Rows, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of rows.nodes) {
      if (n.parentId !== null && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Ids of the nodes above a node, nearest first (its parent, then that node's parent, up to the top-level node). */
export function ancestorIds(rows: Rows, id: string): string[] {
  const byId = new Map(rows.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  let at = byId.get(id)?.parentId ?? null;
  while (at !== null && !out.includes(at)) {
    out.push(at);
    at = byId.get(at)?.parentId ?? null;
  }
  return out;
}

/** The top-level node a node hangs from (the node itself when it is top-level). */
export function topOf(rows: Rows, id: string): NodeRec | undefined {
  const chain = [id, ...ancestorIds(rows, id)];
  const top = chain[chain.length - 1];
  return rows.nodes.find((n) => n.id === top && n.parentId === null);
}

/** A node may be nested under another unless that other is itself or below it. */
export function canNest(rows: Rows, id: string, targetId: string): boolean {
  return id !== targetId && !subtreeIds(rows, id).has(targetId) && rows.nodes.some((n) => n.id === targetId);
}

/** The order that puts something last among the children of `parentId` (null: among top-level nodes). */
export function nextOrder(rows: Rows, parentId: string | null): number {
  const orders = [
    ...rows.nodes.filter((n) => n.parentId === parentId).map((n) => n.order),
    ...(parentId === null ? [] : rows.cards.filter((c) => c.parentId === parentId).map((c) => c.order)),
  ];
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/** The node as it is once nested under another: no anchor and no carrying, no hand-placed offset. Null when not allowed. */
export function nestNode(rows: Rows, id: string, targetId: string, now: number): NodeRec | null {
  const n = rows.nodes.find((x) => x.id === id);
  if (!n || !canNest(rows, id, targetId)) return null;
  const { anchor: _anchor, carried: _carried, off: _off, ...rest } = n;
  return { ...rest, parentId: targetId, open: n.open, order: nextOrder(rows, targetId), updatedAt: now };
}

/** The card as it is once moved to another node. */
export function nestCard(rows: Rows, id: string, targetId: string, now: number): CardRec | null {
  const c = rows.cards.find((x) => x.id === id);
  if (!c || !rows.nodes.some((n) => n.id === targetId)) return null;
  const { off: _off, ...rest } = c;
  return { ...rest, parentId: targetId, order: nextOrder(rows, targetId), updatedAt: now };
}

/** The node as it is once freed from its parent and placed on the page. */
export function detachNode(rows: Rows, id: string, anchor: NodeAnchor, now: number): NodeRec | null {
  const n = rows.nodes.find((x) => x.id === id);
  if (!n || n.parentId === null) return null;
  const { off: _off, ...rest } = n;
  return { ...rest, parentId: null, anchor, order: nextOrder(rows, null), updatedAt: now };
}

/**
 * Changes how a node opens. What hangs from it loses its hand-placed offsets, because an offset means a nudge in a
 * branch and a float in a panel; the rows to write are returned.
 */
export function restyle(rows: Rows, id: string, style: NodeStyle, now: number): Rows {
  const n = rows.nodes.find((x) => x.id === id);
  if (!n || n.style === style) return { nodes: [], cards: [] };
  const below = subtreeIds(rows, id);
  below.delete(id);
  const nodes: NodeRec[] = [{ ...n, style, updatedAt: now }];
  for (const x of rows.nodes) {
    if (below.has(x.id) && x.off) {
      const { off: _off, ...rest } = x;
      nodes.push({ ...rest, updatedAt: now });
    }
  }
  const cards: CardRec[] = [];
  for (const c of rows.cards) {
    if ((c.parentId === id || below.has(c.parentId)) && c.off) {
      const { off: _off, ...rest } = c;
      cards.push({ ...rest, updatedAt: now });
    }
  }
  return { nodes, cards };
}

/** Ids of the nodes and cards that go when a node is deleted: it, everything below it. */
export function deletionOf(rows: Rows, id: string): { nodeIds: string[]; cardIds: string[] } {
  const below = subtreeIds(rows, id);
  return { nodeIds: [...below], cardIds: rows.cards.filter((c) => below.has(c.parentId)).map((c) => c.id) };
}

export const addOffset = (a: Offset | undefined, dx: number, dy: number): Offset => ({ x: (a?.x ?? 0) + dx, y: (a?.y ?? 0) + dy });

/** A new node, empty. */
export function newNodeRec(init: { id: string; bookId: string; parentId: string | null; title: string; style: NodeStyle; order: number; anchor?: NodeAnchor; now: number }): NodeRec {
  return {
    id: init.id,
    bookId: init.bookId,
    parentId: init.parentId,
    title: init.title,
    style: init.style,
    open: false,
    pinTitle: true,
    ...(init.anchor ? { anchor: init.anchor } : {}),
    order: init.order,
    createdAt: init.now,
    updatedAt: init.now,
  };
}
