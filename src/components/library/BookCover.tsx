import type { BookMeta } from '../../types';
import { coverColors } from './libraryInsights';

/**
 * A book's cover image, or for a book without one a cloth cover with its
 * title and author set in Arabic type. `size` only changes the type scale;
 * the box comes from the parent.
 */
export function BookCover({ book, size = 'md', dimmed = false }: { book: BookMeta; size?: 'sm' | 'md' | 'lg'; dimmed?: boolean }) {
  const cls = `book-cover book-cover--${size}${dimmed ? ' book-cover--dimmed' : ''}`;
  if (book.coverDataUrl) {
    return (
      <span className={cls + ' book-cover--image'}>
        <img src={book.coverDataUrl} alt="" />
      </span>
    );
  }
  const { bg, ink } = coverColors(book.id);
  return (
    <span className={cls} style={{ background: bg, color: ink }}>
      <span className="book-cover__frame">
        <span className="book-cover__title" dir="auto">
          {book.title}
        </span>
        {size !== 'sm' && book.author && (
          <>
            <span className="book-cover__rule" />
            <span className="book-cover__author" dir="auto">
              {book.author}
            </span>
          </>
        )}
      </span>
    </span>
  );
}
