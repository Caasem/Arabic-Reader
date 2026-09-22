import type { Bookmark, Highlight, HighlightColor } from '../../types';
import { HIGHLIGHT_FILL } from '../../theme/tokens';
import { IconBookmark, IconBookmarkFilled, IconClose, IconTrash } from '../shared/icons';
import { useEscapeKey } from '../shared/useEscapeKey';

const COLORS = Object.keys(HIGHLIGHT_FILL) as HighlightColor[];

interface Props {
  bookmarks: Bookmark[];
  highlights: Highlight[];
  onAdd(): void;
  onOpen(target: { cfi: string }): void;
  onRemove(id: string): void;
  onRecolorHighlight(highlight: Highlight, color: HighlightColor): void;
  onRemoveHighlight(highlight: Highlight): void;
  onClose(): void;
}

/** The open book's bookmarks and highlights. */
export function BookmarksPanel({
  bookmarks,
  highlights,
  onAdd,
  onOpen,
  onRemove,
  onRecolorHighlight,
  onRemoveHighlight,
  onClose,
}: Props) {
  useEscapeKey(onClose);
  const sorted = [...bookmarks].sort((a, b) => a.percent - b.percent);

  return (
    <aside className="reader__toc reader__bookmarks" aria-label="Bookmarks and highlights">
      <div className="reader__bookmarks-header">
        <span className="reader__bookmarks-title">Bookmarks</span>
        <button className="reader__search-close" onClick={onClose} aria-label="Close bookmarks">
          <IconClose size={14} />
        </button>
      </div>
      <button className="btn btn--ghost reader__bookmarks-add" onClick={onAdd}>
        <IconBookmark size={14} /> Add bookmark here
      </button>
      {sorted.length === 0 ? (
        <p className="reader__search-empty">No bookmarks in this book yet.</p>
      ) : (
        <div className="reader__bookmarks-list">
          {sorted.map((bookmark) => (
            <div className="reader__bookmark-item" key={bookmark.id}>
              <button className="reader__bookmark-item-main" onClick={() => onOpen(bookmark)}>
                <IconBookmarkFilled size={13} />
                <span className="reader__bookmark-item-text">
                  {bookmark.chapterLabel && <span className="reader__bookmark-item-chapter">{bookmark.chapterLabel}</span>}
                  <span className="reader__bookmark-item-location">{bookmark.locationLabel}</span>
                </span>
              </button>
              <button
                className="reader__bookmark-item-remove"
                onClick={() => onRemove(bookmark.id)}
                aria-label="Remove bookmark"
                title="Remove bookmark"
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <>
          <h2 className="reader__bookmarks-section-title">Highlights</h2>
          <div className="reader__bookmarks-list">
            {highlights.map((highlight) => (
              <div className="reader__bookmark-item reader__highlight-item" key={highlight.id}>
                <button className="reader__bookmark-item-main" onClick={() => onOpen({ cfi: highlight.cfiRange })}>
                  <span
                    className="reader__highlight-dot"
                    style={{ background: HIGHLIGHT_FILL[highlight.color] }}
                    aria-hidden="true"
                  />
                  <span className="reader__bookmark-item-text">
                    {highlight.chapterLabel && (
                      <span className="reader__bookmark-item-chapter">{highlight.chapterLabel}</span>
                    )}
                    <span className="reader__highlight-text" lang="ar" dir="auto">
                      {highlight.text}
                    </span>
                  </span>
                </button>
                <button
                  className="reader__bookmark-item-remove"
                  onClick={() => onRemoveHighlight(highlight)}
                  aria-label="Remove highlight"
                  title="Remove highlight"
                >
                  <IconTrash size={13} />
                </button>
                <div className="reader__highlight-colors" role="group" aria-label="Highlight color">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      className={'hl-swatch' + (highlight.color === color ? ' hl-swatch--active' : '')}
                      style={{ background: HIGHLIGHT_FILL[color] }}
                      aria-pressed={highlight.color === color}
                      aria-label={`Make ${color}`}
                      onClick={() => onRecolorHighlight(highlight, color)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
