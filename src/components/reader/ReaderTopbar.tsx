import { IconBack, IconBookmark, IconBookmarkFilled, IconContents, IconFocus, IconSearch } from '../shared/icons';

interface Props {
  chapterLabel?: string;
  bookmarkCount: number;
  onBack(): void;
  onToggleQuickSettings(): void;
  onTogglePomodoro(): void;
  onToggleSearch(): void;
  onAddBookmark(): void;
  onToggleBookmarks(): void;
  onToggleToc(): void;
  onSwitchToCleanReader(): void;
  onEnterCleanFocus(): void;
}

export function ReaderTopbar({
  chapterLabel,
  bookmarkCount,
  onBack,
  onToggleQuickSettings,
  onTogglePomodoro,
  onToggleSearch,
  onAddBookmark,
  onToggleBookmarks,
  onToggleToc,
  onSwitchToCleanReader,
  onEnterCleanFocus,
}: Props) {
  return (
    <header className="reader__topbar">
      <button className="reader__back" onClick={onBack}>
        <IconBack size={14} /> Library
      </button>
      <div className="reader__chapter" dir="auto">
        {chapterLabel}
      </div>
      <div className="reader__topbar-actions">
        <button
          className="reader__toc-toggle"
          onClick={onToggleQuickSettings}
          aria-label="Font and appearance"
          title="Font and appearance"
          style={{ fontFamily: 'serif', fontWeight: 600 }}
        >
          Aa
        </button>
        <button className="reader__toc-toggle" onClick={onTogglePomodoro} aria-label="Start Pomodoro" title="Start Pomodoro">
          Pomodoro
        </button>
        <button
          className="reader__toc-toggle"
          onClick={onSwitchToCleanReader}
          title="Switch to the clean text reader (beta)"
        >
          Clean text
        </button>
        <button className="reader__toc-toggle" onClick={onEnterCleanFocus} title="Focus: clean text with nothing else on screen">
          <IconFocus size={14} /> Focus
        </button>
        <button className="reader__toc-toggle" onClick={onToggleSearch}>
          <IconSearch size={14} /> Search
        </button>
        <button className="reader__toc-toggle" onClick={onAddBookmark} aria-label="Add bookmark here" title="Add bookmark here">
          <IconBookmark size={14} />
        </button>
        <button className="reader__toc-toggle" onClick={onToggleBookmarks}>
          <IconBookmarkFilled size={14} /> Bookmarks{bookmarkCount > 0 ? ` (${bookmarkCount})` : ''}
        </button>
        <button className="reader__toc-toggle" onClick={onToggleToc}>
          <IconContents size={14} /> Contents
        </button>
      </div>
    </header>
  );
}
