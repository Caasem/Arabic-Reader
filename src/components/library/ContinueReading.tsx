import type { BookMeta, ReadingSession } from '../../types';
import { BookCover } from './BookCover';
import { formatDuration, timeLeftMs, type ReadingInfo } from './libraryInsights';

interface Props {
  book: BookMeta;
  info: ReadingInfo;
  /** This book's sessions, for the time-left estimate. */
  sessions: ReadingSession[];
  /** Other books in progress, most recent first. */
  alsoReading: { book: BookMeta; percent: number }[];
  onOpen(book: BookMeta): void;
  onDetails(book: BookMeta): void;
}

/** The book to pick up again, large, with the next few in progress under it. */
export function ContinueReading({ book, info, sessions, alsoReading, onOpen, onDetails }: Props) {
  const percent = Math.round(info.percent * 100);
  const left = timeLeftMs(sessions, info.percent);
  return (
    <section className="lib-hero" aria-label="Continue reading">
      <button type="button" className="lib-hero__cover" onClick={() => onOpen(book)} aria-label={`Resume ${book.title}`}>
        <BookCover book={book} size="lg" />
      </button>
      <div className="lib-hero__body">
        <div className="lib-eyebrow">
          <span className="lib-eyebrow__dot" aria-hidden="true" />
          Continue reading
        </div>
        <div>
          <h2 className="lib-hero__title" dir="auto">
            {book.title}
          </h2>
          {book.author && (
            <div className="lib-hero__author" dir="auto">
              {book.author}
            </div>
          )}
        </div>
        {info.chapterLabel && (
          <div className="lib-hero__chapter" dir="auto">
            {info.chapterLabel}
          </div>
        )}
        <div>
          <div className="lib-progress lib-progress--lg" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Reading progress">
            <div className="lib-progress__fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="lib-hero__meta">
            <span>{percent}% read</span>
            {left !== undefined && <span>About {formatDuration(left)} left at your pace</span>}
          </div>
        </div>
        <div className="lib-hero__actions">
          <button type="button" className="btn btn--primary" onClick={() => onOpen(book)}>
            Resume reading
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onDetails(book)}>
            Book details
          </button>
        </div>
        {alsoReading.length > 0 && (
          <div className="lib-hero__also">
            <div className="lib-hero__also-label">Also in progress</div>
            {alsoReading.map(({ book: b, percent: p }) => (
              <button key={b.id} type="button" className="lib-hero__also-row" onClick={() => onOpen(b)}>
                <span className="lib-hero__also-cover">
                  <BookCover book={b} size="sm" />
                </span>
                <span className="lib-hero__also-title" dir="auto">
                  {b.title}
                </span>
                <span className="lib-hero__also-pct">{Math.round(p * 100)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
