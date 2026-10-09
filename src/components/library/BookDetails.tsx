import { useState, type ReactNode } from 'react';
import type { BookMeta, Highlight, LibraryShelf } from '../../types';
import { useEscapeKey } from '../shared/useEscapeKey';
import { BookCover } from './BookCover';
import { bookStatus, formatDuration, relativeDay, type BookStats, type ReadingInfo } from './libraryInsights';

interface Props {
  book: BookMeta;
  info: ReadingInfo | undefined;
  stats: BookStats | undefined;
  highlights: Highlight[];
  shelves: LibraryShelf[];
  missingFile: boolean;
  onClose(): void;
  onOpen(book: BookMeta): void;
  onOpenHighlight(highlight: Highlight): void;
  onStudyWords(): void;
  onToggleShelf(shelfId: string): void;
  onExportHighlights(): void;
  onFreeSpace(): void;
  onAddFile(): void;
  onRemove(): void;
  /** Extra rows under the Read button (the volumes of a Browse library book that are not added yet). */
  extra?: ReactNode;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** Everything about one book, in a panel from the side. */
export function BookDetails(props: Props) {
  const { book, info, stats, highlights, shelves, missingFile, onClose } = props;
  const [shelfMenu, setShelfMenu] = useState(false);
  useEscapeKey(onClose);
  const percent = Math.round((info?.percent ?? 0) * 100);
  const status = bookStatus(info?.percent);
  const cta = missingFile ? 'Add file to read' : status === 'reading' ? 'Resume reading' : status === 'finished' ? 'Read again' : 'Start reading';
  const statusLabel = status === 'finished' ? 'Finished' : status === 'reading' ? `${percent}% read` : 'Not started';
  const added = new Date(book.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="lib-sheet">
      <button type="button" className="lib-sheet__backdrop" aria-label="Close book details" onClick={onClose} />
      <aside className="lib-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="lib-sheet-title">
        <div className="lib-sheet__top">
          <button type="button" className="lib-icon-btn" aria-label="Close" onClick={onClose} autoFocus>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="lib-sheet__body">
          <div className="lib-sheet__head">
            <span className="lib-sheet__cover">
              <BookCover book={book} size="md" dimmed={missingFile} />
            </span>
            <div className="lib-sheet__titles">
              <h2 id="lib-sheet-title" className="lib-sheet__title" dir="auto">
                {book.title}
              </h2>
              {book.author && (
                <div className="lib-sheet__author" dir="auto">
                  {book.author}
                </div>
              )}
              <div className="lib-sheet__facts">
                {book.format.toUpperCase()} · added {added} · {formatSize(book.sizeBytes)}
              </div>
              {missingFile && <div className="lib-sheet__missing">The file is on another device</div>}
            </div>
          </div>

          <div>
            <div className="lib-progress lib-progress--lg">
              <div className="lib-progress__fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="lib-sheet__progress-meta">
              <span>{statusLabel}</span>
              <span>Last read {relativeDay(info?.lastReadAt)}</span>
            </div>
          </div>

          <div className="lib-sheet__stats">
            <div className="lib-sheet__stat">
              <strong>{stats?.highlights ?? 0}</strong>
              <span>Highlights</span>
            </div>
            <div className="lib-sheet__stat">
              <strong>{stats?.words ?? 0}</strong>
              <span>Words saved</span>
            </div>
            <div className="lib-sheet__stat">
              <strong>{stats?.activeMs ? formatDuration(stats.activeMs) : '—'}</strong>
              <span>Time read</span>
            </div>
          </div>

          <div className="lib-sheet__cta">
            <button type="button" className="btn btn--primary" onClick={() => (missingFile ? props.onAddFile() : props.onOpen(book))}>
              {cta}
            </button>
            {(stats?.words ?? 0) > 0 && (
              <button type="button" className="btn btn--ghost" onClick={props.onStudyWords}>
                Study its words
              </button>
            )}
          </div>

          {props.extra}

          <div className="lib-sheet__section">
            <div className="lib-sheet__section-title">Highlights</div>
            {highlights.length === 0 ? (
              <div className="lib-sheet__empty">No highlights yet. Select text while reading to save one here.</div>
            ) : (
              highlights.slice(0, 6).map((h) => (
                <button key={h.id} type="button" className="lib-sheet__quote" onClick={() => props.onOpenHighlight(h)} disabled={missingFile}>
                  <span className="lib-sheet__quote-text" dir="auto">
                    <span className={`lib-mark lib-mark--${h.color}`}>{h.text}</span>
                  </span>
                  <span className="lib-sheet__quote-meta">
                    {h.chapterLabel && <span dir="auto">{h.chapterLabel} · </span>}
                    {relativeDay(h.createdAt)}
                  </span>
                </button>
              ))
            )}
            {highlights.length > 6 && <div className="lib-sheet__more">and {highlights.length - 6} more in Highlights</div>}
          </div>

          <div className="lib-sheet__menu">
            <button type="button" className="lib-sheet__item" aria-expanded={shelfMenu} onClick={() => setShelfMenu((v) => !v)}>
              Shelves…
            </button>
            {shelfMenu && (
              <div className="lib-sheet__shelves">
                {shelves.length === 0 ? (
                  <div className="lib-sheet__empty">No shelves yet. Use “New shelf” above the books to make one.</div>
                ) : (
                  shelves.map((s) => (
                    <label key={s.id} className="lib-sheet__shelf">
                      <input type="checkbox" checked={s.bookIds.includes(book.id)} onChange={() => props.onToggleShelf(s.id)} />
                      <span className="lib-dot" style={{ background: s.color }} aria-hidden="true" />
                      {s.name}
                    </label>
                  ))
                )}
              </div>
            )}
            {highlights.length > 0 && (
              <button type="button" className="lib-sheet__item" onClick={props.onExportHighlights}>
                Export highlights as Markdown
              </button>
            )}
            {missingFile ? (
              <button type="button" className="lib-sheet__item" onClick={props.onAddFile}>
                Add the file from this device…
              </button>
            ) : (
              <button type="button" className="lib-sheet__item" onClick={props.onFreeSpace}>
                Free up space (keep progress and notes)
              </button>
            )}
            <button type="button" className="lib-sheet__item lib-sheet__item--danger" onClick={props.onRemove}>
              Remove from library…
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
