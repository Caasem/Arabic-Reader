import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BookMeta } from '../types';
import { anchorAtScreen } from './anchorDom';
import { buildTree, type Rows } from './model';
import { NodeGroup, type ViewCtx } from './NodeView';
import { addTopNode, detach } from './nodeStore';
import type { NodeKid, NodeStyle } from './types';
import { useAnchorPoints } from './useAnchorPoints';
import { useNodeActions } from './useNodeActions';
import { applyLive, useNodeDrag } from './useNodeDrag';
import './nodes.css';

interface Props {
  book: BookMeta;
  rows: Rows;
  tree: NodeKid[];
  adding: boolean;
  defaultStyle: NodeStyle;
  onAdded(): void;
}

const TOAST_MS = 4000;

/** Opens a card's text for typing, with all of it selected. */
function startEdit(el: HTMLElement) {
  el.contentEditable = 'true';
  el.dataset.orig = el.textContent ?? '';
  el.classList.add('editing');
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * Nodes over the reader: a layer the size of the stage (the quiet reader's, or the PDF pages'), above it, that lets
 * every touch through except those that land on a node. It places each top-level node from its anchor, and owns
 * the listening for everything drawn by NodeView (which marks its controls with `data-nx-*`).
 */
export function NodesLayer({ book, rows, tree: savedTree, adding, defaultStyle, onAdded }: Props) {
  const { stage, frame, points } = useAnchorPoints(savedTree);
  const suppress = useRef(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const notify = useCallback((message: string, undo?: () => void) => setToast({ message, undo }), []);
  const actions = useNodeActions(book.id, rows, notify);
  const { drag, live, target, hint, onPointerDown } = useNodeDrag({ bookId: book.id, rows, stage, frame, points, suppress });
  /** Something just added that should open for typing: a node's title or a card's text. */
  const focusAfter = useRef<{ kind: 'title' | 'text'; id: string } | null>(null);
  // The store answers after the layer has already drawn once, so asking for focus draws again.
  const [focusTick, setFocusTick] = useState(0);
  const focusNext = useCallback((kind: 'title' | 'text', id: string) => {
    focusAfter.current = { kind, id };
    setFocusTick((t) => t + 1);
  }, []);

  // While a nested dot or card is dragged, the tree is drawn with its live offset.
  const tree = useMemo(() => (live ? buildTree(applyLive(rows, live)) : savedTree), [live, rows, savedTree]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  // A node or card just added opens for typing.
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    const el = document.querySelector<HTMLElement>(want.kind === 'title' ? `[data-nx-title="${want.id}"]` : `[data-nx-text="${want.id}"]`);
    if (!el) return;
    focusAfter.current = null;
    if (want.kind === 'text') return startEdit(el);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [tree, points, focusTick]);

  if (!stage || !frame) return null;
  const ctx: ViewCtx = { width: frame.width, height: frame.height, controls: true, carry: false, drop: target };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const hit = (attr: string) => t.closest<HTMLElement>(`[${attr}]`);
    let el: HTMLElement | null;
    if ((el = hit('data-nx-pin'))) return actions.togglePin(el.dataset.nxPin!);
    if ((el = hit('data-nx-style'))) return actions.restyle(el.dataset.nxStyle!);
    if ((el = hit('data-nx-add'))) {
      const parent = el.dataset.nxFor!;
      const made = el.dataset.nxAdd === 'note' ? actions.addNote(parent) : actions.addBranch(parent);
      void made.then((id) => {
        if (id) focusNext(el!.dataset.nxAdd === 'note' ? 'text' : 'title', id);
      });
      return;
    }
    if ((el = hit('data-nx-remove'))) return actions.removeNode(el.dataset.nxRemove!);
    if ((el = hit('data-nx-detach'))) {
      const id = el.dataset.nxDetach!;
      const dot = document.querySelector<HTMLElement>(`[data-nx-dot="${id}"]`)?.getBoundingClientRect();
      const at = dot && anchorAtScreen(stage, dot.left + dot.width / 2 + 46, dot.top + dot.height / 2 + 34);
      if (at) void detach(book.id, id, at);
      return;
    }
    if (t.closest('[contenteditable="true"]')) return;
    if ((el = hit('data-nx-dot'))) {
      if (!suppress.current) actions.toggleOpen(el.dataset.nxDot!);
      return;
    }
    if (adding && t === e.currentTarget) {
      const at = anchorAtScreen(stage, e.clientX, e.clientY);
      if (!at) return;
      void addTopNode(book.id, at, defaultStyle, 'New node').then((n) => focusNext('title', n.id));
      onAdded();
    }
  };

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const text = (e.target as HTMLElement).closest<HTMLElement>('[data-nx-text]');
    if (text && text.contentEditable !== 'true') startEdit(text);
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const title = t.closest<HTMLElement>('[data-nx-title]');
    if (title) {
      const id = title.dataset.nxTitle!;
      actions.rename(id, title.textContent ?? '');
      // Put the stored title back if what was typed was empty.
      window.setTimeout(() => {
        const now = document.querySelector<HTMLElement>(`[data-nx-title="${id}"]`);
        const stored = rows.nodes.find((n) => n.id === id)?.title;
        if (now && stored && !(now.textContent ?? '').trim()) now.textContent = stored;
      }, 0);
      return;
    }
    const text = t.closest<HTMLElement>('[data-nx-text]');
    if (text && text.contentEditable === 'true') {
      const id = text.dataset.nxText!;
      text.contentEditable = 'false';
      text.classList.remove('editing');
      actions.editCard(id, text.textContent ?? '');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (!t.isContentEditable) return;
    // Typing in a title or a card is typing: the reader's own keys stay out of it.
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      t.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (t.dataset.nxText) t.textContent = t.dataset.orig ?? t.textContent;
      else {
        const stored = rows.nodes.find((n) => n.id === t.dataset.nxTitle)?.title;
        if (stored) t.textContent = stored;
      }
      t.blur();
    }
  };

  const layer = (
    <div
      className={'nx-layer' + (adding ? ' is-adding' : '')}
      style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {(adding || hint) && <div className="nx-hint">{hint ?? 'Tap the page to place a node'}</div>}
      {tree.map((root) => {
        const p = drag?.id === root.node.id ? drag : points.get(root.node.id);
        return p ? <NodeGroup key={root.node.id} root={root} x={p.x} y={p.y} ctx={ctx} dragging={drag?.id === root.node.id} /> : null;
      })}
    </div>
  );
  const toastView =
    toast &&
    createPortal(
      <div className="reader__quick-add-toast reader__touch-toast" role="status">
        <span>{toast.message}</span>
        {toast.undo && (
          <button
            className="reader__touch-toast-undo"
            onClick={() => {
              toast.undo?.();
              setToast(null);
            }}
          >
            Undo
          </button>
        )}
      </div>,
      document.body
    );
  return (
    <>
      {createPortal(layer, document.body)}
      {toastView}
    </>
  );
}
