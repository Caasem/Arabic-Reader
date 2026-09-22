import type { ShamelaCatalogBook } from '../../shamela/types';

interface Props {
  book: ShamelaCatalogBook;
  downloading: boolean;
  progress: string;
  onDownload: (book: ShamelaCatalogBook) => void;
}

/** A not-yet-downloaded Shamela search hit, rendered in the same grid as
 * owned books but visually muted so the two stay easy to tell apart. */
export function ShamelaResultCard({ book, downloading, progress, onDownload }: Props) {
  return (
    <div className="book-card book-card--remote">
      <button
        className="book-card__open"
        onClick={() => onDownload(book)}
        disabled={downloading}
        title="Download from Shamela"
      >
        <div className="book-card__cover">
          <span className="book-card__cover-fallback">{book.title.slice(0, 1)}</span>
          <span className="book-card__source-badge" aria-hidden="true">
            {downloading ? '⋯' : '⬇'}
          </span>
        </div>
        <div className="book-card__title">{book.title}</div>
        {book.author && <div className="book-card__author">{book.author}</div>}
        <div className="book-card__remote-status">{downloading ? progress : 'Shamela'}</div>
      </button>
    </div>
  );
}
