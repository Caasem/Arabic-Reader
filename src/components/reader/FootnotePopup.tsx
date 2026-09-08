import './FootnotePopup.css';

export function FootnotePopup({
  loading,
  html,
  failed,
  x,
  y,
  onClose,
  onGoToNote,
}: {
  loading: boolean;
  html: string | null;
  /** True once loading has finished but no content could be resolved. */
  failed: boolean;
  x: number;
  y: number;
  onClose: () => void;
  /** Falls back to normal in-book navigation when we couldn't resolve the note inline. */
  onGoToNote: () => void;
}) {
  const clampedX = Math.min(Math.max(x, 160), window.innerWidth - 160);
  const POPUP_HEIGHT_ESTIMATE = 200;
  const showBelow = y < POPUP_HEIGHT_ESTIMATE + 24;
  const clampedY = showBelow ? Math.min(y, window.innerHeight - 40) : Math.min(y, window.innerHeight - 20);

  return (
    <div className="footnote-popup-backdrop" onClick={onClose}>
      <div
        className={'footnote-popup' + (showBelow ? ' footnote-popup--below' : '')}
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="footnote-popup__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="footnote-popup__label">Note</div>

        {loading && <div className="footnote-popup__loading">Loading note…</div>}

        {!loading && !failed && html && (
          <div className="footnote-popup__body" dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {!loading && failed && (
          <div className="footnote-popup__failed">
            <div className="footnote-popup__failed-text">Couldn't load this note inline.</div>
            <button className="footnote-popup__goto" onClick={onGoToNote}>
              Go to note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
