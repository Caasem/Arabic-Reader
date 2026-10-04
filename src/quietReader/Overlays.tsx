import { useLayoutEffect, useRef, useState } from 'react';
import { HIGHLIGHT_FILL } from '../theme/tokens';
import type { HighlightColor } from '../types';
import { IconClose, IconPencil } from './icons';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];
const MARGIN = 10;

export interface ViewportRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Places a floating box above `anchor` (below when there's no room), kept on screen. */
function useAnchored(anchor: ViewportRect, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const center = (anchor.left + anchor.right) / 2;
    const left = Math.min(Math.max(MARGIN, center - width / 2), window.innerWidth - width - MARGIN);
    const above = anchor.top - gap - height;
    const top = above >= MARGIN ? above : Math.min(anchor.bottom + gap, window.innerHeight - height - MARGIN);
    setPos({ left, top });
  }, [anchor.left, anchor.right, anchor.top, anchor.bottom, gap]);
  return { ref, style: pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 } };
}

/** Over selected text: five highlight colours and a note. */
export function SelectionBar({ anchor, onPick, onNote }: { anchor: ViewportRect; onPick(color: HighlightColor): void; onNote(): void }) {
  const { ref, style } = useAnchored(anchor, 10);
  return (
    <div ref={ref} className="qr-selbar" role="toolbar" aria-label="Highlight colour" style={style} onPointerDown={(e) => e.preventDefault()}>
      {COLORS.map((c) => (
        <button key={c} type="button" className="qr-selbar__swatch" aria-label={`Highlight ${c}`} title={`Highlight ${c}`} onClick={() => onPick(c)}>
          <span style={{ background: HIGHLIGHT_FILL[c] }} />
        </button>
      ))}
      <span className="qr-selbar__sep" aria-hidden="true" />
      <button type="button" className="qr-selbar__note" onClick={onNote}>
        <IconPencil />
        Note
      </button>
    </div>
  );
}

/** A footnote shown where its marker is, with a way to its place in the book. */
export function NotePopover({
  anchor,
  number,
  text,
  onGo,
  onClose,
}: {
  anchor: ViewportRect;
  number: string;
  text: string;
  onGo?: () => void;
  onClose(): void;
}) {
  const { ref, style } = useAnchored(anchor, 10);
  return (
    <div ref={ref} className="qr-note" role="dialog" aria-label={`Note ${number}`} style={style}>
      <div className="qr-note__head">
        Note {number}
        <button type="button" className="qr-close qr-close--plain qr-close--sm" onClick={onClose} aria-label="Close note">
          <IconClose size={15} />
        </button>
      </div>
      <p className="qr-note__text" dir="auto" lang="ar">
        {text || 'This note could not be found in the book.'}
      </p>
      {onGo && (
        <button type="button" className="qr-chip-btn" onClick={onGo}>
          Go to note
        </button>
      )}
    </div>
  );
}
