import type { HighlightColor } from '../../types';
import { anchoredPosition } from '../shared/anchoredPosition';
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
  const { left, top, below } = anchoredPosition(x, y, { halfWidth: 120, flipBelowY: 90, bottomMarginBelow: 30 });

  return (
    <div className="selection-toolbar-backdrop" onClick={onDismiss}>
      <div
        className={'selection-toolbar' + (below ? ' selection-toolbar--below' : '')}
        style={{ left, top }}
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
