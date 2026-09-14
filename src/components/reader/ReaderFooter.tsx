interface Props {
  focusMode: boolean;
  idle: boolean;
  pageLabel?: string;
  percent: number;
  onRevealChrome(): void;
  onNext(): void;
  onPrev(): void;
}

export function ReaderFooter({ focusMode, idle, pageLabel, percent, onRevealChrome, onNext, onPrev }: Props) {
  const percentLabel = `${Math.round(percent * 100)}%`;
  return (
    <footer
      className={'reader__footer' + (focusMode ? ' reader__footer--focus' : '') + (idle ? ' reader__footer--idle' : '')}
      onMouseEnter={onRevealChrome}
    >
      {/* RTL reading order: "further in" (Next) is the left-hand button. */}
      <button className="reader__nav-btn" onClick={onNext} aria-label="Next page">
        <span className="reader__nav-btn-label">Next</span>
        <span className="reader__nav-btn-icon">‹</span>
      </button>
      <div className="reader__progress">
        <div className="reader__progress-label">{pageLabel ?? percentLabel}</div>
        <div className="reader__progress-track">
          <div className="reader__progress-bar" style={{ width: percentLabel }} />
        </div>
      </div>
      <button className="reader__nav-btn" onClick={onPrev} aria-label="Previous page">
        <span className="reader__nav-btn-icon">›</span>
        <span className="reader__nav-btn-label">Previous</span>
      </button>
    </footer>
  );
}
