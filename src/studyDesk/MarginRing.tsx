import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './marginRing.css';

/**
 * A ring of shortcuts around the pointer, opened by right-clicking a margin, a margin note or a highlighted
 * box on a PDF page (or a long press on touch screens). Each button names its key, so the ring also teaches
 * the keys. Click a button, or press its number (1–8); Esc or a click outside closes it.
 */

export interface RingAction {
  id: string;
  label: string;
  /** The keyboard shortcut that does the same, shown under the label. */
  keys?: string;
  /** Marks an action that removes something. */
  danger?: boolean;
  run(): void;
}

/** What a ring can ask of the desk host (DeskHost), besides what the margin itself does. */
export interface DeskCommands {
  capture(): void;
  pullIn(): void;
  inbox(): void;
  document(itemId?: string): void;
  hideMargins(): void;
  /** Absent while away on a capture trip, or when books cannot be switched here. */
  goToBook?(): void;
}

/** The ring for empty margin space: write here, then the desk's shortcuts. */
export function marginActions(c: DeskCommands, write: () => void, settings: () => void): RingAction[] {
  return [
    { id: 'write', label: 'Write a note here', keys: 'Double-tap', run: write },
    { id: 'capture', label: 'Capture a region', keys: 'Alt X', run: c.capture },
    { id: 'pull', label: 'Pull in', keys: 'Alt U', run: c.pullIn },
    { id: 'inbox', label: 'Inbox', keys: 'Alt I', run: c.inbox },
    { id: 'doc', label: 'Document', keys: 'D', run: () => c.document() },
    ...(c.goToBook ? [{ id: 'go', label: 'Go to another book', run: c.goToBook }] : []),
    { id: 'settings', label: 'Margin settings', run: settings },
    { id: 'hide', label: 'Hide margins', keys: 'Alt M', run: c.hideMargins },
  ];
}

/** An open ring: where, what it is about, and its buttons. */
export interface RingState {
  x: number;
  y: number;
  title: string;
  actions: RingAction[];
}

const RADIUS = 92;
const BUTTON = 68;

export function MarginRing({ x, y, title, actions, onClose }: { x: number; y: number; title: string; actions: RingAction[]; onClose(): void }) {
  const [active, setActive] = useState<number | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  // Keep the whole ring on screen.
  const pad = RADIUS + BUTTON / 2 + 8;
  const cx = Math.min(Math.max(x, pad), window.innerWidth - pad);
  const cy = Math.min(Math.max(y, pad), window.innerHeight - pad);

  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= actions.length && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        actions[n - 1].run();
      }
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [actions, onClose]);

  const hovered = active !== null ? actions[active] : null;

  return createPortal(
    <div
      className="sd-ring-back"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onContextMenu={(e) => {
        // A second right-click outside closes the ring instead of opening the browser's menu.
        e.preventDefault();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sd-ring" role="menu" aria-label={title} style={{ left: cx, top: cy }}>
        <div className="sd-ring__hub" aria-hidden="true">
          <b>{hovered ? hovered.label : title}</b>
          <span>{hovered?.keys ?? 'Esc closes'}</span>
        </div>
        {actions.map((a, i) => {
          const angle = (i / actions.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={a.id}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitem"
              className={'sd-ring__btn' + (a.danger ? ' sd-ring__btn--danger' : '') + (active === i ? ' sd-ring__btn--on' : '')}
              style={{ left: Math.cos(angle) * RADIUS, top: Math.sin(angle) * RADIUS, width: BUTTON, height: BUTTON }}
              title={a.keys ? `${a.label} (${a.keys})` : a.label}
              aria-keyshortcuts={a.keys}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((v) => (v === i ? null : v))}
              onFocus={() => setActive(i)}
              onClick={() => {
                onClose();
                a.run();
              }}
            >
              <span className="sd-ring__n">{i + 1}</span>
              <span className="sd-ring__l">{a.label}</span>
              {a.keys && <kbd>{a.keys}</kbd>}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

/** Opens a ring on right-click, and on a long press for touch (where there is no right button). */
export function useRingTrigger(open: (x: number, y: number, el: HTMLElement) => void) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number; el: HTMLElement } | null>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      open(e.clientX, e.clientY, e.currentTarget as HTMLElement);
    },
    onPointerDown(e: React.PointerEvent) {
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY, el: e.currentTarget as HTMLElement };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => start.current && open(start.current.x, start.current.y, start.current.el), 550);
    },
    onPointerMove(e: React.PointerEvent) {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
        start.current = null;
        window.clearTimeout(timer.current);
      }
    },
    onPointerUp() {
      start.current = null;
      window.clearTimeout(timer.current);
    },
  };
}
