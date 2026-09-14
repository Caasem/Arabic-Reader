import { IconBack, IconBookmark, IconBookmarkFilled, IconContents, IconFocus, IconSearch } from '../shared/icons';

interface Props {
  chapterLabel?: string;
  focusMode: boolean;
  idle: boolean;
  bookmarkCount: number;
  onRevealChrome(): void;
  onBack(): void;
  onToggleQuickSettings(): void;
  onTogglePomodoro(): void;
  onFocusModeChange(on: boolean): void;
  onToggleSearch(): void;
  onAddBookmark(): void;
  onToggleBookmarks(): void;
  onToggleToc(): void;
}

export function ReaderTopbar({
  chapterLabel,
  focusMode,
  idle,
  bookmarkCount,
  onRevealChrome,
  onBack,
  onToggleQuickSettings,
  onTogglePomodoro,
  onFocusModeChange,
  onToggleSearch,
  onAddBookmark,
  onToggleBookmarks,
  onToggleToc,
}: Props) {
  return (
    <header
      className={'reader__topbar' + (focusMode ? ' reader__topbar--focus' : '') + (idle ? ' reader__topbar--idle' : '')}
      onMouseEnter={onRevealChrome}
    >
      <button className="reader__back" onClick={onBack}>
        <IconBack size={14} /> Library
      </button>
      <div className="reader__chapter">{chapterLabel}</div>
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
        <label className={'reader__focus-toggle' + (focusMode ? ' reader__focus-toggle--on' : '')} title="Focus mode">
          <input type="checkbox" checked={focusMode} onChange={(e) => onFocusModeChange(e.target.checked)} aria-label="Toggle focus mode" />
          <IconFocus size={15} />
          <span className="reader__focus-toggle-track">
            <span className="reader__focus-toggle-knob" />
          </span>
        </label>
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
