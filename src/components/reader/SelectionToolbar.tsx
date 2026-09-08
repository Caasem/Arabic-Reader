import type { HighlightColor } from '../../types';
import './SelectionToolbar.css';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];

export function SelectionToolbar({
  x,
  y,
  onPick,
  onDismiss,
}: {
  x: number;
  y: number;
  onPick: (color: HighlightColor) => void;
  onDismiss: () => void;
}) {
  const clampedX = Math.min(Math.max(x, 120), window.innerWidth - 120);
  const showBelow = y < 90;
  const clampedY = showBelow ? Math.min(y, window.innerHeight - 30) : Math.min(y, window.innerHeight - 20);

  return (
    <div className="selection-toolbar-backdrop" onClick={onDismiss}>
      <div
        className={'selection-toolbar' + (showBelow ? ' selection-toolbar--below' : '')}
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
      >
        {COLORS.map((c) => (
          <button
            key={c}
            className={`selection-toolbar__swatch selection-toolbar__swatch--${c}`}
            aria-label={`Highlight ${c}`}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}
