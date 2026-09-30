import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta } from '../types';
import { pickContinueBook, type ReadingInfoMap } from './continueBook';
import './libraryHero.css';

interface Props {
  books: BookMeta[];
  readingInfo: ReadingInfoMap;
  onOpen(book: BookMeta): void;
}

/**
 * "Continue reading": the most recently read unfinished book, as a card above
 * the library. Renders nothing while the new look is off, or when there is no
 * book in progress.
 */
export function LibraryHero({ books, readingInfo, onOpen }: Props) {
  const { prefs } = usePreferences();
  if (!prefs.lookEnabled) return null;

  const current = pickContinueBook(books, readingInfo);
  if (!current) return null;

  const percent = Math.round((readingInfo[current.id]?.percent ?? 0) * 100);
  const book = current;

  return (
    <section className="look-hero" aria-label="Continue reading">
      <div className="look-hero__cover" aria-hidden="true">
        {book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : <span>{book.title.trim().charAt(0) || 'ق'}</span>}
      </div>
      <div className="look-hero__body">
        <div className="look-hero__eyebrow">Continue reading</div>
        <h2 className="look-hero__title" dir="auto">
          {book.title}
        </h2>
        {book.author && (
          <div className="look-hero__author" dir="auto">
            {book.author}
          </div>
        )}
        <div className="look-hero__progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Reading progress">
          <div className="look-hero__track">
            <div className="look-hero__fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="look-hero__percent">{percent}%</span>
        </div>
        <button type="button" className="look-hero__resume" onClick={() => onOpen(book)}>
          Resume reading
        </button>
      </div>
    </section>
  );
}
