import type { ReactNode } from 'react';
import { IconBackChevron, IconBookmark, IconChevronLeft, IconChevronRight, IconSliders } from './icons';

export function Header({
  bookTitle,
  chapterTitle,
  bookmarked,
  onBack,
  onToggleBookmark,
  onOpenSettings,
  extra,
}: {
  bookTitle: string;
  chapterTitle?: string;
  /** More controls before the bookmark (the PDF pages' text-recognition chip). */
  extra?: ReactNode;
  bookmarked: boolean;
  onBack(): void;
  onToggleBookmark(): void;
  onOpenSettings(): void;
}) {
  return (
    <header className="qr-header">
      <button type="button" className="qr-pill-btn" onClick={onBack}>
        <IconBackChevron />
        Library
      </button>
      <div className="qr-header__title" dir="rtl">
        <span className="qr-header__book" lang="ar" dir="auto">
          {bookTitle}
        </span>
        {chapterTitle && (
          <>
            <span className="qr-header__dot" aria-hidden="true">
              ·
            </span>
            <span className="qr-header__chapter" lang="ar" dir="auto">
              {chapterTitle}
            </span>
          </>
        )}
      </div>
      <div className="qr-header__actions">
        {extra}
        <button
          type="button"
          className={'qr-round-btn' + (bookmarked ? ' qr-round-btn--on' : '')}
          onClick={onToggleBookmark}
          aria-pressed={bookmarked}
          aria-label="Bookmark this page"
          title="Bookmark this page"
        >
          <IconBookmark filled={bookmarked} />
        </button>
        <button type="button" className="qr-round-btn" onClick={onOpenSettings} aria-label="All settings" title="All settings">
          <IconSliders />
        </button>
      </div>
    </header>
  );
}

/** The two page-turn buttons at the page's sides. In right-to-left reading, "next" is on the left. */
export function TurnButtons({
  leftLabel,
  rightLabel,
  leftX,
  rightX,
  onLeft,
  onRight,
}: {
  leftLabel: string;
  rightLabel: string;
  leftX: number;
  rightX: number;
  onLeft(): void;
  onRight(): void;
}) {
  return (
    <>
      <button type="button" className="qr-turn" style={{ left: leftX }} onClick={onLeft} aria-label={leftLabel} title={`${leftLabel} (←)`}>
        <IconChevronLeft />
      </button>
      <button type="button" className="qr-turn" style={{ right: rightX }} onClick={onRight} aria-label={rightLabel} title={`${rightLabel} (→)`}>
        <IconChevronRight />
      </button>
    </>
  );
}

/** The thin bar along the bottom edge: how far through the book, with a tick where each chapter starts. */
export function ProgressRail({ percent, ticks }: { percent: number; ticks: number[] }) {
  return (
    <div className="qr-rail" aria-hidden="true">
      <div className="qr-rail__fill" style={{ width: `${percent * 100}%` }} />
      {ticks.map((t, i) => (
        <div key={i} className="qr-rail__tick" style={{ left: `${t * 100}%` }} />
      ))}
    </div>
  );
}
