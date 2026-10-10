import { DockTools } from '../readerTools';
import type { ReactNode } from 'react';
import {
  IconBackChevron,
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconFocus,
  IconLevels,
  IconList,
  IconSearch,
  IconSliders,
  IconTimer,
  IconWords,
} from './icons';

export function Header({
  bookTitle,
  chapterTitle,
  bookmarked,
  onBack,
  onToggleBookmark,
  onOpenSettings,
}: {
  bookTitle: string;
  chapterTitle?: string;
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

export type DockAction = 'contents' | 'search' | 'marks' | 'words' | 'display' | 'levels' | 'timer' | 'focus';

export const DOCK_ITEMS: { id: DockAction; label: string; title: string; icon: ReactNode }[] = [
  { id: 'contents', label: 'Contents', title: 'Contents', icon: <IconList /> },
  { id: 'search', label: 'Search', title: 'Search this book, your library or the dictionary', icon: <IconSearch /> },
  { id: 'marks', label: 'Marks', title: 'Bookmarks and highlights', icon: <IconBookmark /> },
  { id: 'words', label: 'Words', title: 'Words saved from this book', icon: <IconWords /> },
  {
    id: 'display',
    label: 'Display',
    title: 'Font and display',
    icon: (
      <span className="qr-dock__aa" aria-hidden="true">
        Aa
      </span>
    ),
  },
  { id: 'levels', label: 'Levels', title: 'Vocab levels for this book', icon: <IconLevels /> },
  { id: 'timer', label: 'Timer', title: 'Pomodoro', icon: <IconTimer /> },
  { id: 'focus', label: 'Focus', title: 'Focus: just the text (Esc to leave)', icon: <IconFocus /> },
];

/** The one pill at the bottom of the page: every reader tool, grouped. */
export function Dock({
  active,
  labels,
  timerLabel,
  center,
  onAction,
}: {
  active: ReadonlySet<DockAction>;
  labels: boolean;
  timerLabel: string;
  /** Horizontal centre in the reader, px. */
  center: number;
  onAction(action: DockAction): void;
}) {
  return (
    <nav className="qr-dock" aria-label="Reader tools" style={{ left: center }}>
      {DOCK_ITEMS.map((item) => (
        <DockSlot key={item.id} before={item.id === 'display' || item.id === 'levels'}>
          <button
            type="button"
            className={'qr-dock__btn' + (active.has(item.id) ? ' qr-dock__btn--on' : '')}
            onClick={() => onAction(item.id)}
            aria-pressed={item.id === 'focus' ? undefined : active.has(item.id)}
            aria-label={item.id === 'timer' ? 'Pomodoro timer' : item.label}
            title={item.title}
          >
            {item.icon}
            {labels && <span className={item.id === 'timer' ? 'qr-dock__time' : undefined}>{item.id === 'timer' ? timerLabel : item.label}</span>}
          </button>
        </DockSlot>
      ))}
      {/* Other features' tools (study desk, ink) come from the shared tool list (src/readerTools). */}
      <DockTools labels={labels} />
    </nav>
  );
}

function DockSlot({ before, children }: { before: boolean; children: ReactNode }) {
  return (
    <>
      {before && <span className="qr-dock__sep" aria-hidden="true" />}
      {children}
    </>
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
