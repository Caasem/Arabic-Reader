import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { ReaderPreferences } from '../types';

type Style = ReaderPreferences['dictionarySearchStyle'];

const POS_KEY = 'dictionarySearch.floatingPos';
const FLOAT_WIDTH = 320;
const MARGIN = 12;

interface Pos {
  x: number;
  y: number;
}

function loadPos(key: string): Pos | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
}

function clamp(pos: Pos, height: number): Pos {
  return {
    x: Math.min(Math.max(pos.x, MARGIN), Math.max(MARGIN, window.innerWidth - FLOAT_WIDTH - MARGIN)),
    y: Math.min(Math.max(pos.y, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
  };
}

/** What the frame says about itself. Defaults are the dictionary search's; the study desk inbox passes its own. */
export interface ShellLabels {
  /** Drawer header title. */
  title?: string;
  /** The shortcut shown in the header. */
  keyHint?: string;
  /** Accessible name of the dialog. */
  label?: string;
  /** Where the floating position is remembered. */
  posKey?: string;
}

/** Frames the search in one of the four layouts. */
export function Shell({ style, onClose, children, title = 'Dictionary', keyHint = 'Alt D', label = 'Dictionary search', posKey = POS_KEY }: { style: Style; onClose(): void; children: ReactNode } & ShellLabels) {
  if (style === 'floating') return <Floating onClose={onClose} keyHint={keyHint} label={label} posKey={posKey}>{children}</Floating>;
  if (style === 'drawer') {
    return (
      <aside className="dsearch dsearch--drawer" aria-label={label}>
        <div className="dsearch__header">
          <span className="dsearch__title">{title}</span>
          <kbd className="dsearch__key">{keyHint}</kbd>
          <CloseButton onClose={onClose} label={label} />
        </div>
        {children}
      </aside>
    );
  }
  return (
    <>
      <div className="dsearch-backdrop" onClick={onClose} />
      <div className={'dsearch dsearch--' + style} role="dialog" aria-label={label}>
        {style === 'sheet' && <div className="dsearch__handle" aria-hidden="true" />}
        {children}
      </div>
    </>
  );
}

function CloseButton({ onClose, label = 'Dictionary search' }: { onClose(): void; label?: string }) {
  return (
    <button type="button" className="dsearch__close" aria-label={'Close ' + label.toLowerCase()} onClick={onClose}>
      ×
    </button>
  );
}

function Floating({ onClose, children, keyHint, label, posKey }: { onClose(): void; children: ReactNode; keyHint: string; label: string; posKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>(() => loadPos(posKey) ?? { x: window.innerWidth - FLOAT_WIDTH - 24, y: 96 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const refit = () => setPos((p) => clamp(p, ref.current?.offsetHeight ?? 300));
    refit();
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, []);

  function onPointerDown(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, ref.current?.offsetHeight ?? 300));
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
      className="dsearch dsearch--floating"
      style={{ left: pos.x, top: pos.y, width: FLOAT_WIDTH }}
      role="dialog"
      aria-label={label}
    >
      <div
        className="dsearch__header dsearch__header--grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="7" r="1.6" />
          <circle cx="16" cy="7" r="1.6" />
          <circle cx="8" cy="12" r="1.6" />
          <circle cx="16" cy="12" r="1.6" />
          <circle cx="8" cy="17" r="1.6" />
          <circle cx="16" cy="17" r="1.6" />
        </svg>
        <span className="dsearch__title">Drag to move</span>
        <kbd className="dsearch__key">{keyHint}</kbd>
        <CloseButton onClose={onClose} label={label} />
      </div>
      {children}
    </div>
  );
}
