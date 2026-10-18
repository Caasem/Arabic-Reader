import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from './anchor';
import { anchorAtScreen, type ReaderStage } from './anchorDom';
import { ancestorIds, subtreeIds, type Rows } from './model';
import { detach, moveTopNode, nest, setOffset } from './nodeStore';
import type { CardRec, Offset } from './types';

/**
 * Dragging a dot or a card.
 * - A top-level dot moves: it is tied to the nearest word, or the page, where it is let go.
 * - A nested dot, or a card in a branch, is spaced out by hand: it stays attached, with an offset from where the layout
 *   would put it (in a reticle panel it floats out of the outline, tied to the panel's dot).
 * - Let go over another node, its dot or its open panel, and it is nested there. Let go over one of its own ancestors and
 *   it returns to its place. Alt-drag frees a nested dot as a node of its own, where it is let go.
 */

export interface Live {
  kind: 'node' | 'card';
  id: string;
  off: Offset;
}
export interface Target {
  id: string;
  part: 'dot' | 'panel';
}
interface TopDrag {
  id: string;
  x: number;
  y: number;
}

const DRAG_SLOP = 5;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** The rows as they look while something is being dragged: the dragged one carries the live offset. */
export function applyLive(rows: Rows, live: Live): Rows {
  return live.kind === 'node'
    ? { ...rows, nodes: rows.nodes.map((n) => (n.id === live.id ? { ...n, off: live.off } : n)) }
    : { ...rows, cards: rows.cards.map((c) => (c.id === live.id ? { ...c, off: live.off } : c)) };
}

/** The node dot, or open panel, under a point, ignoring anything that belongs to what is being dragged. */
function targetAt(x: number, y: number, own: Set<string>): Target | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const dot = el.closest<HTMLElement>('[data-nx-dot]');
    if (dot) {
      if (own.has(dot.dataset.nxDot!)) continue;
      return { id: dot.dataset.nxDot!, part: 'dot' };
    }
    const panel = el.closest<HTMLElement>('[data-nx-owner]');
    if (panel) {
      if (own.has(panel.dataset.nxOwner!)) continue;
      return { id: panel.dataset.nxOwner!, part: 'panel' };
    }
  }
  return null;
}

interface Deps {
  bookId: string;
  rows: Rows;
  stage: ReaderStage | null;
  frame: DOMRect | null;
  points: Map<string, Point>;
  /** Set while a drag has just ended, so the click that follows it is ignored. */
  suppress: { current: boolean };
}

export function useNodeDrag(deps: Deps) {
  const latest = useRef(deps);
  useEffect(() => {
    latest.current = deps;
  });
  const [drag, setDrag] = useState<TopDrag | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const settling = useRef(false);

  // What was dropped stays where it was dropped until its saved place has been read back.
  const { rows, points } = deps;
  useEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    setDrag(null);
    setLive(null);
  }, [rows, points]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button) return;
    const t = e.target as HTMLElement;
    if (t.closest('[contenteditable="true"]')) return;
    const cardEl = t.closest<HTMLElement>('.nx-it[data-nx-card]');
    const dotEl = t.closest<HTMLElement>('[data-nx-dot]');
    if (!cardEl && !dotEl) return;
    const { rows: r0, points: p0, bookId } = latest.current;
    const kind: 'node' | 'card' = cardEl ? 'card' : 'node';
    const id = cardEl ? cardEl.dataset.nxCard! : dotEl!.dataset.nxDot!;
    const top = !cardEl && dotEl!.dataset.nxTop === '1';
    const start = { x: e.clientX, y: e.clientY, moved: false };
    const alt = e.altKey && kind === 'node';
    // A row in a reticle panel has no place of its own; it floats out from the panel's dot.
    const owner = dotEl?.closest('.nx-rh') ? (dotEl.closest<HTMLElement>('[data-nx-owner]')?.dataset.nxOwner ?? null) : null;
    const row = kind === 'node' ? r0.nodes.find((n) => n.id === id) : r0.cards.find((c) => c.id === id);
    if (!row) return;
    let off0: Offset = row.off ? { ...row.off } : { x: 0, y: 0 };
    const x0 = p0.get(id)?.x ?? 0;
    const y0 = p0.get(id)?.y ?? 0;
    if (top && !p0.has(id)) return;
    const own = kind === 'node' ? subtreeIds(r0, id) : new Set<string>([id]);
    const parentOfCard = kind === 'card' ? (row as CardRec).parentId : null;
    const above = parentOfCard === null ? ancestorIds(r0, id) : [parentOfCard, ...ancestorIds(r0, parentOfCard)];
    let last: Offset = off0;
    let tgt: Target | null = null;

    const move = (ev: PointerEvent) => {
      const { frame, stage } = latest.current;
      if (!frame || !stage) return;
      let dx = ev.clientX - start.x;
      let dy = ev.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!start.moved) {
        start.moved = true;
        if (!top && owner && !row.off) {
          const od = document.querySelector<HTMLElement>(`[data-nx-dot="${owner}"]`)?.getBoundingClientRect();
          if (od) off0 = { x: ev.clientX - (od.left + od.width / 2), y: ev.clientY - (od.top + od.height / 2) };
          start.x = ev.clientX;
          start.y = ev.clientY;
          dx = 0;
          dy = 0;
        }
      }
      if (top) setDrag({ id, x: clamp(x0 + dx, 0, frame.width), y: clamp(y0 + dy, 0, frame.height) });
      else {
        last = { x: off0.x + dx, y: off0.y + dy };
        setLive({ kind, id, off: last });
      }
      tgt = targetAt(ev.clientX, ev.clientY, own);
      setTarget(tgt);
    };

    const end = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      setTarget(null);
      if (!start.moved) return;
      const { suppress, stage, frame } = latest.current;
      suppress.current = true;
      window.setTimeout(() => (suppress.current = false), 60);
      const settle = () => {
        settling.current = true;
        // If the saved place reads back the same, nothing else would clear the override.
        window.setTimeout(() => {
          setDrag(null);
          setLive(null);
        }, 400);
      };
      const cancel = () => {
        setDrag(null);
        setLive(null);
      };
      if (ev.type !== 'pointerup' || !stage || !frame) return cancel();
      if (tgt && !own.has(tgt.id)) {
        settle();
        if (above.includes(tgt.id)) void (row.off ? setOffset(kind, id, null) : Promise.resolve());
        else void nest(bookId, kind, id, tgt.id);
        return;
      }
      if (top) {
        const at = anchorAtScreen(stage, frame.left + clamp(x0 + ev.clientX - start.x, 0, frame.width), frame.top + clamp(y0 + ev.clientY - start.y, 0, frame.height));
        if (!at) return cancel();
        settle();
        void moveTopNode(id, at);
      } else if (alt) {
        const at = anchorAtScreen(stage, ev.clientX, ev.clientY);
        if (!at) return cancel();
        settle();
        void detach(bookId, id, at);
      } else {
        settle();
        void setOffset(kind, id, last);
      }
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }, []);

  // What the drop would do, for the hint: put the dragged one back, or nest it.
  const movingId = drag?.id ?? live?.id ?? null;
  const targetNode = target ? rows.nodes.find((n) => n.id === target.id) : undefined;
  let hint: string | null = null;
  if (movingId && targetNode) {
    const card = rows.cards.find((c) => c.id === movingId);
    const above = card ? [card.parentId, ...ancestorIds(rows, card.parentId)] : ancestorIds(rows, movingId);
    hint = `${above.includes(targetNode.id) ? 'Release to put it back in' : 'Release to nest in'} “${targetNode.title}”`;
  }

  return { drag, live, target, hint, onPointerDown };
}
