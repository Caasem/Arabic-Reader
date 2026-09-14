import type { Bookmark } from '../../types';
import { IconBookmark, IconBookmarkFilled, IconClose, IconTrash } from '../shared/icons';

interface Props {
  bookmarks: Bookmark[];
  onAdd(): void;
  onOpen(bookmark: Bookmark): void;
  onRemove(id: string): void;
  onClose(): void;
}

export function BookmarksPanel({ bookmarks, onAdd, onOpen, onRemove, onClose }: Props) {
  const sorted = [...bookmarks].sort((a, b) => a.percent - b.percent);
  return (
    <aside className="reader__toc reader__bookmarks">
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
    </aside>
  );
}
