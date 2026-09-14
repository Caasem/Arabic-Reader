import { useCallback, useEffect, useRef, useState } from 'react';

/** Stillness before Focus mode fades the reader chrome out. */
const FOCUS_IDLE_MS = 2200;
/** The sidebar comes back only via a deliberate drag from the left edge. */
const EDGE_ZONE_PX = 24;
const EDGE_DRAG_PX = 48;

export interface PointerHandlers {
  down(event: PointerEvent): void;
  move(event: PointerEvent): void;
  up(): void;
}

const NO_POINTER_HANDLERS: PointerHandlers = { down: () => {}, move: () => {}, up: () => {} };

/**
 * Focus mode: the topbar and footer fade after a moment of stillness and
 * return on a tap; the app sidebar (hidden via `onChromeHiddenChange`) only
 * returns on a left-edge drag, since bringing back a whole panel mid-scroll
 * was too easy to trigger by accident.
 */
export function useFocusMode(onChromeHiddenChange?: (hidden: boolean) => void) {
  const [focusMode, setFocusModeState] = useState(false);
  const [idle, setIdle] = useState(false);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  // Forwarded from book iframes, which the window listeners below can't see.
  const pointerHandlersRef = useRef<PointerHandlers>(NO_POINTER_HANDLERS);

  const setFocusMode = useCallback((on: boolean) => {
    setFocusModeState(on);
    setIdle(false);
    setSidebarPeek(false);
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    let timer: number | null = null;
    const goIdleLater = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIdle(true);
        setSidebarPeek(false);
      }, FOCUS_IDLE_MS);
    };
    const wake = () => {
      setIdle(false);
      goIdleLater();
    };
    goIdleLater();
    window.addEventListener('click', wake);

    let dragStart: { x: number; y: number } | null = null;
    const handlers: PointerHandlers = {
      down(e) {
        dragStart = e.clientX <= EDGE_ZONE_PX ? { x: e.clientX, y: e.clientY } : null;
      },
      move(e) {
        if (!dragStart) return;
        if (e.clientX - dragStart.x > EDGE_DRAG_PX && Math.abs(e.clientY - dragStart.y) < EDGE_DRAG_PX) {
          setSidebarPeek(true);
          wake();
          dragStart = null;
        }
      },
      up() {
        dragStart = null;
      },
    };
    const onDown = (e: PointerEvent) => handlers.down(e);
    const onMove = (e: PointerEvent) => handlers.move(e);
    const onUp = () => handlers.up();
    pointerHandlersRef.current = handlers;
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('click', wake);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (timer !== null) window.clearTimeout(timer);
      pointerHandlersRef.current = NO_POINTER_HANDLERS;
    };
  }, [focusMode]);

  const chromeIdle = focusMode && idle;
  const chromeHidden = chromeIdle && !sidebarPeek;

  useEffect(() => {
    onChromeHiddenChange?.(chromeHidden);
  }, [chromeHidden, onChromeHiddenChange]);

  // Never leave the sidebar hidden once the Reader is gone.
  useEffect(() => () => onChromeHiddenChange?.(false), [onChromeHiddenChange]);

  const revealChrome = useCallback(() => setIdle(false), []);

  return { focusMode, setFocusMode, chromeIdle, revealChrome, pointerHandlersRef };
}
