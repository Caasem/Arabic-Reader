import './HoverPreview.css';

export function HoverPreview({
  gloss,
  x,
  y,
}: {
  /** Short, single-line gloss text. Null while still loading — nothing renders until it resolves. */
  gloss: string | null;
  x: number;
  y: number;
}) {
  if (!gloss) return null;
  const clampedX = Math.min(Math.max(x, 90), window.innerWidth - 90);

  return (
    <div className="hover-preview" style={{ left: clampedX, top: y }}>
      <span className="hover-preview__text">{gloss}</span>
      <span className="hover-preview__chevron">‹</span>
    </div>
  );
}
