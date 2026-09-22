import { clampX } from '../shared/anchoredPosition';
import './HoverPreview.css';

export function HoverPreview({
  gloss,
  x,
  y,
}: {
  /** Short, single-line gloss text. */
  gloss: string;
  x: number;
  y: number;
}) {
  return (
    <div className="hover-preview" style={{ left: clampX(x, 90), top: y }} role="tooltip">
      <span className="hover-preview__text">{gloss}</span>
      <span className="hover-preview__chevron" aria-hidden="true">
        ‹
      </span>
    </div>
  );
}
