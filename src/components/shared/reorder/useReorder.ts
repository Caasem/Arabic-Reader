import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { dropIndex, moveToIndex } from './reorder';

export type ReorderAxis = 'x' | 'y';

/** Pointer travel (px) before a press on a whole item (a tab) counts as a drag rather than a click. */
const DRAG_THRESHOLD = 5;

/**
 * Drag-and-drop reordering of a list of ids, by pointer events (mouse, pen and touch alike) with the
 * arrow keys as the keyboard way. The list reorders live as the pointer crosses the other items; the
 * caller stores each new order through `onReorder`.
 *
 * Wire-up: `containerRef` on the list element, `itemProps(id)` on each item and `handleProps(id)` on the
 * element you grab (a grip button, or the item itself for something like a tab). A handle that is the
 * item itself also starts the drag only after DRAG_THRESHOLD px, and swallows the click that ends it.
 */
export function useReorder({
  ids,
  onReorder,
  axis = 'y',
  immediate = true,
  keyboard = true,
}: {
  ids: readonly string[];
  onReorder(next: string[]): void;
  axis?: ReorderAxis;
  /** Start dragging at once on press (a grip). False: only after moving a few pixels (a tab). */
  immediate?: boolean;
  /** Arrow keys on the focused handle move it one place. Off for a tab, where the arrows mean something else. */
  keyboard?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const swallowClick = useRef(false);
  const refocusId = useRef<string | null>(null);

  const itemMid = useCallback(
    (el: Element) => {
      const r = el.getBoundingClientRect();
      return axis === 'y' ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2;
    },
    [axis],
  );

  const onPointerDown = useCallback(
    (id: string, e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const start = axis === 'y' ? e.clientY : e.clientX;
      const startOther = axis === 'y' ? e.clientX : e.clientY;
      let active = immediate;
      if (active) setDraggingId(id);

      function move(ev: globalThis.PointerEvent) {
        const pos = axis === 'y' ? ev.clientY : ev.clientX;
        if (!active) {
          const other = axis === 'y' ? ev.clientX : ev.clientY;
          if (Math.abs(pos - start) < DRAG_THRESHOLD && Math.abs(other - startOther) < DRAG_THRESHOLD) return;
          active = true;
          setDraggingId(id);
        }
        const container = containerRef.current;
        if (!container) return;
        const rtl = axis === 'x' && getComputedStyle(container).direction === 'rtl';
        const items = Array.from(container.querySelectorAll<HTMLElement>('[data-reorder-id]')).filter((el) => el.dataset.reorderId !== id);
        const index = dropIndex(items.map(itemMid), (mid) => (rtl ? mid > pos : mid < pos));
        const current = idsRef.current;
        if (current.indexOf(id) !== index) onReorderRef.current(moveToIndex(current, id, index));
      }
      function end() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (active) {
          swallowClick.current = true;
          // A drag ends with a click on the handle; the flag is dropped again if none follows.
          window.setTimeout(() => (swallowClick.current = false), 0);
        }
        setDraggingId(null);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [axis, immediate, itemMid],
  );

  const onKeyDown = useCallback(
    (id: string, e: KeyboardEvent<HTMLElement>) => {
      const container = containerRef.current;
      const rtl = axis === 'x' && !!container && getComputedStyle(container).direction === 'rtl';
      let delta = 0;
      if (axis === 'y') delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      else if (e.key === 'ArrowLeft') delta = rtl ? 1 : -1;
      else if (e.key === 'ArrowRight') delta = rtl ? -1 : 1;
      if (!delta) return;
      e.preventDefault();
      e.stopPropagation();
      const current = idsRef.current;
      const from = current.indexOf(id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= current.length) return;
      refocusId.current = id;
      onReorderRef.current(moveToIndex(current, id, to));
    },
    [axis],
  );

  // A keyboard move re-inserts the handle in the DOM, which drops its focus: put it back.
  useLayoutEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    containerRef.current?.querySelector<HTMLElement>(`[data-reorder-handle="${CSS.escape(id)}"]`)?.focus();
  });

  return {
    containerRef,
    draggingId,
    /** Add to the list element's className: stops text being selected while dragging. */
    listClass: draggingId ? 'reorder-list--dragging' : '',
    itemProps: (id: string) => ({
      'data-reorder-id': id,
      className: 'reorder-item' + (draggingId === id ? ' reorder-item--dragging' : ''),
    }),
    handleProps: (id: string) => ({
      'data-reorder-handle': id,
      onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(id, e),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (keyboard) onKeyDown(id, e);
      },
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    }),
  };
}
