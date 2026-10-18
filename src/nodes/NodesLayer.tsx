import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BookMeta } from '../types';
import { anchorAtScreen } from './anchorDom';
import { NodeGroup, type ViewCtx } from './NodeView';
import { addTopNode, moveTopNode } from './nodeStore';
import type { Rows } from './model';
import type { NodeKid, NodeStyle } from './types';
import { useAnchorPoints } from './useAnchorPoints';
import { useNodeActions } from './useNodeActions';
import './nodes.css';

interface Props {
  book: BookMeta;
  rows: Rows;
  tree: NodeKid[];
  adding: boolean;
  defaultStyle: NodeStyle;
  onAdded(): void;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
/** Less than this many pixels of movement is a tap, not a drag. */
const DRAG_SLOP = 5;

/**
 * Nodes over the reader: a layer the size of the stage (the quiet reader's, or the PDF pages'), above it, that lets
 * every touch through except those that land on a node. It places each top-level node from its anchor, and owns
 * the listening for everything drawn by NodeView (which marks its controls with `data-nx-*`).
 */
export function NodesLayer({ book, rows, tree, adding, defaultStyle, onAdded }: Props) {
  const { stage, frame, points } = useAnchorPoints(tree);
  const actions = useNodeActions(rows);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const settling = useRef(false);
  const suppress = useRef(false);
  const focusAfter = useRef<string | null>(null);

  // A node just dropped stays where it was dropped until its saved place has been measured.
  useEffect(() => {
    if (settling.current) {
      settling.current = false;
      setDrag(null);
    }
  }, [points]);

  // A node just added opens its title for typing.
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    const title = document.querySelector<HTMLElement>(`[data-nx-title="${id}"]`);
    if (!title) return;
    focusAfter.current = null;
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [tree, points]);

  if (!stage || !frame) return null;
  const ctx: ViewCtx = { width: frame.width, height: frame.height, controls: false };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const pin = t.closest<HTMLElement>('[data-nx-pin]');
    if (pin) return actions.togglePin(pin.dataset.nxPin!);
    if (t.closest('[contenteditable="true"]')) return;
    const dot = t.closest<HTMLElement>('[data-nx-dot]');
    if (dot) {
      if (!suppress.current) actions.toggleOpen(dot.dataset.nxDot!);
      return;
    }
    if (adding && t === e.currentTarget) {
      const at = anchorAtScreen(stage, e.clientX, e.clientY);
      if (!at) return;
      void addTopNode(book.id, at, defaultStyle, 'New node').then((n) => {
        focusAfter.current = n.id;
      });
      onAdded();
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dot = (e.target as HTMLElement).closest<HTMLElement>('[data-nx-dot][data-nx-top]');
    if (!dot || e.button) return;
    const id = dot.dataset.nxDot!;
    const p = points.get(id);
    if (!p) return;
    const start = { x: e.clientX, y: e.clientY, x0: p.x, y0: p.y, moved: false };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      start.moved = true;
      setDrag({ id, x: clamp(start.x0 + dx, 0, frame.width), y: clamp(start.y0 + dy, 0, frame.height) });
    };
    const end = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!start.moved) return;
      suppress.current = true;
      window.setTimeout(() => (suppress.current = false), 60);
      const at = ev.type === 'pointerup' ? anchorAtScreen(stage, frame.left + clamp(start.x0 + ev.clientX - start.x, 0, frame.width), frame.top + clamp(start.y0 + ev.clientY - start.y, 0, frame.height)) : null;
      if (!at) return setDrag(null);
      settling.current = true;
      void moveTopNode(id, at);
      // If the saved place measures the same as the old one, nothing else would clear the drag.
      window.setTimeout(() => setDrag(null), 400);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const title = (e.target as HTMLElement).closest<HTMLElement>('[data-nx-title]');
    if (!title) return;
    const id = title.dataset.nxTitle!;
    actions.rename(id, title.textContent ?? '');
    // Put the stored title back if what was typed was empty (or is not saved yet).
    window.setTimeout(() => {
      const now = document.querySelector<HTMLElement>(`[data-nx-title="${id}"]`);
      const stored = rows.nodes.find((n) => n.id === id)?.title;
      if (now && stored && !(now.textContent ?? '').trim()) now.textContent = stored;
    }, 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.isContentEditable) return;
    // Typing in a title is typing: the reader's own keys stay out of it.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      t.blur();
    } else if (e.key === 'Escape') {
      const stored = rows.nodes.find((n) => n.id === t.dataset.nxTitle)?.title;
      if (stored) t.textContent = stored;
      t.blur();
    }
  };

  return createPortal(
    <div
      className={'nx-layer' + (adding ? ' is-adding' : '')}
      style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {adding && <div className="nx-hint">Tap the page to place a node</div>}
      {tree.map((root) => {
        const p = drag?.id === root.node.id ? drag : points.get(root.node.id);
        return p ? <NodeGroup key={root.node.id} root={root} x={p.x} y={p.y} ctx={ctx} dragging={drag?.id === root.node.id} /> : null;
      })}
    </div>,
    document.body
  );
}
