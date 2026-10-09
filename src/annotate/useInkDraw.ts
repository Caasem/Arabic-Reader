import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { addStroke, deleteStrokes, restoreStrokes } from './inkStore';
import { inkUi, MARKER_WIDTH, recordInk, setInkUi } from './inkUi';
import { pathD, pressureWidth, r3 } from './geometry';
import type { InkPoint, InkStroke } from './types';

/** One stroke being written: how screen points become the stroke's own units, and where it is saved. */
export interface InkSession {
  map(clientX: number, clientY: number): [number, number];
  /** Stroke units per CSS pixel where the stroke starts. */
  unitsPerPx: number;
  /** The live stroke's group transform, so it is drawn in the same units as it will be saved in. */
  transform?: string;
  /** Everything about the stroke except its points, tool, colour and width. */
  base: Pick<InkStroke, 'bookId' | 'key' | 'offset'>;
}

export interface InkSurface {
  /** Starts a stroke at this point, or null when there is nowhere to tie it. */
  begin(clientX: number, clientY: number): InkSession | null;
  /** The strokes the eraser touches at this point. */
  hitsAt(clientX: number, clientY: number): InkStroke[];
}

/**
 * Pointer handling shared by the PDF page layer and the clean text layer: pen and marker strokes (pressure
 * widens a stylus's line), the eraser (whole strokes), and Undo steps. Once a stylus has been used, fingers
 * no longer write so the page can still be scrolled.
 */
export function useInkDraw(surface: InkSurface, colors: Record<string, string>) {
  const liveRef = useRef<SVGPathElement>(null);
  const liveGroupRef = useRef<SVGGElement>(null);
  const active = useRef<
    | { kind: 'ink'; id: number; session: InkSession; pts: InkPoint[]; pen: boolean; tool: 'pen' | 'marker'; width: number }
    | { kind: 'erase'; id: number; removed: Map<string, InkStroke> }
    | null
  >(null);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;

  const erase = useCallback((x: number, y: number) => {
    const a = active.current;
    if (!a || a.kind !== 'erase') return;
    const hits = surfaceRef.current.hitsAt(x, y).filter((s) => !a.removed.has(s.id));
    if (!hits.length) return;
    hits.forEach((s) => a.removed.set(s.id, s));
    void deleteStrokes(hits.map((s) => s.id));
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<Element>) => {
      const ui = inkUi();
      if (!ui.inking || (e.button !== 0 && e.pointerType === 'mouse')) return;
      if (e.pointerType === 'pen' && !ui.penSeen) setInkUi({ penSeen: true });
      if (e.pointerType === 'touch' && ui.penSeen) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety.
      }
      if (ui.tool === 'eraser') {
        active.current = { kind: 'erase', id: e.pointerId, removed: new Map() };
        erase(e.clientX, e.clientY);
        return;
      }
      const session = surfaceRef.current.begin(e.clientX, e.clientY);
      if (!session) return;
      const tool = ui.tool;
      const width = r3((tool === 'marker' ? MARKER_WIDTH : ui.width) * session.unitsPerPx);
      const [x, y] = session.map(e.clientX, e.clientY);
      active.current = { kind: 'ink', id: e.pointerId, session, pts: [[r3(x), r3(y), e.pressure || 0.5]], pen: e.pointerType === 'pen', tool, width };
      const live = liveRef.current;
      liveGroupRef.current?.setAttribute('transform', session.transform ?? '');
      if (live) {
        live.setAttribute('d', pathD(active.current.pts));
        live.setAttribute('class', 'ink-stroke' + (tool === 'marker' ? ' ink-stroke--marker' : ''));
        live.style.stroke = colors[ui.color];
        live.style.strokeWidth = String(width);
      }
    },
    [colors, erase]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<Element>) => {
      const a = active.current;
      if (!a || a.id !== e.pointerId) return;
      if (a.kind === 'erase') {
        erase(e.clientX, e.clientY);
        return;
      }
      const native = e.nativeEvent;
      const events = native.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [native]) {
        const [x, y] = a.session.map(ev.clientX, ev.clientY);
        const last = a.pts[a.pts.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) / a.session.unitsPerPx >= 1.5) a.pts.push([r3(x), r3(y), Math.round((ev.pressure || 0.5) * 100) / 100]);
      }
      liveRef.current?.setAttribute('d', pathD(a.pts));
    },
    [erase]
  );

  const finish = useCallback((e: ReactPointerEvent<Element>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    active.current = null;
    if (a.kind === 'erase') {
      const removed = [...a.removed.values()];
      if (removed.length)
        recordInk({
          undo: () => restoreStrokes(removed),
          redo: () => deleteStrokes(removed.map((s) => s.id)),
        });
      return;
    }
    const width = a.tool === 'pen' ? pressureWidth(a.width, a.pts, a.pen) : a.width;
    void addStroke({ ...a.session.base, tool: a.tool, color: inkUi().color, width, pts: a.pts }).then((row) => {
      liveRef.current?.setAttribute('d', '');
      recordInk({ undo: () => deleteStrokes([row.id]), redo: () => restoreStrokes([row]) });
    });
  }, []);

  return { liveRef, liveGroupRef, handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish } };
}
