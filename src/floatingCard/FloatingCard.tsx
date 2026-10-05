import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './floatingCard.css';

interface Pos {
  x: number;
  y: number;
}

const MARGIN = 12;
const NARROW_QUERY = '(max-width: 600px)';

function loadPos(key: string): Pos | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
}

function clamp(pos: Pos, width: number, height: number): Pos {
  return {
    x: Math.min(Math.max(pos.x, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
    y: Math.min(Math.max(pos.y, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
  };
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

interface FloatingCardProps {
  /** Names the card for screen readers, and shows beside the grip. */
  label: string;
  /** The shortcut shown in the header, e.g. "Alt N". */
  keyHint: string;
  /** localStorage key remembering where the card was left. */
  posKey: string;
  /** Where the card first appears, before it has been moved. */
  defaultPos(width: number): Pos;
  width?: number;
  onClose(): void;
  children: ReactNode;
}

/**
 * A card that floats over the reader without blocking it: no backdrop, dragged
 * by its header, and remembered where it was left. On narrow screens it is a
 * bottom sheet instead. Escape is left to the caller, which knows whether
 * there is unsaved text to keep.
 */
export function FloatingCard({ label, keyHint, posKey, defaultPos, width = 340, onClose, children }: FloatingCardProps) {
  const narrow = useIsNarrow();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>(() => loadPos(posKey) ?? defaultPos(width));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (narrow) return;
    const refit = () => setPos((p) => clamp(p, width, ref.current?.offsetHeight ?? 300));
    refit();
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [narrow, width]);

  function onPointerDown(e: ReactPointerEvent) {
    if (narrow || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, width, ref.current?.offsetHeight ?? 300));
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(posKey, JSON.stringify(pos));
    } catch {
      // Position just won't be remembered.
    }
  }

  return (
    <div
      ref={ref}
      className={'fcard' + (narrow ? ' fcard--sheet' : '')}
      style={narrow ? undefined : { left: pos.x, top: pos.y, width }}
      role="dialog"
      aria-label={label}
    >
      <div
        className={'fcard__header' + (narrow ? '' : ' fcard__header--grip')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {!narrow && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="7" r="1.6" />
            <circle cx="16" cy="7" r="1.6" />
            <circle cx="8" cy="12" r="1.6" />
            <circle cx="16" cy="12" r="1.6" />
            <circle cx="8" cy="17" r="1.6" />
            <circle cx="16" cy="17" r="1.6" />
          </svg>
        )}
        <span className="fcard__title">{label}</span>
        <kbd className="fcard__key">{keyHint}</kbd>
        <button type="button" className="fcard__close" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="fcard__body">{children}</div>
    </div>
  );
}
