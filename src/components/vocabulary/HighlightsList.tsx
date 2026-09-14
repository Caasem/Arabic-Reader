import { useEffect, useMemo, useRef, useState } from 'react';
import { annotationService } from '../../reader/annotations/annotationService';
import { HIGHLIGHT_FILL } from '../../theme/tokens';
import type { Highlight, HighlightColor } from '../../types';
import './HighlightsList.css';

const COLORS = Object.keys(HIGHLIGHT_FILL) as HighlightColor[];
const ALL = 'all';

interface Props {
  /** Opens the highlight in its book; resolves false if the book was removed. */
  onOpenInBook?(highlight: Highlight): Promise<boolean>;
}

export function HighlightsList({ onOpenInBook }: Props) {
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [bookFilter, setBookFilter] = useState<string>(ALL);
  const [colorFilter, setColorFilter] = useState<HighlightColor | typeof ALL>(ALL);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  // Mirrors editingNoteId for blur handlers that fire after editing ended.
  const editingNoteRef = useRef<string | null>(null);
  const [missingBookIds, setMissingBookIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    annotationService.listAll().then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const books = useMemo(() => {
    const titles = new Map<string, string>();
    for (const h of items ?? []) titles.set(h.bookId, h.bookTitle);
    return [...titles].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (h) => (bookFilter === ALL || h.bookId === bookFilter) && (colorFilter === ALL || h.color === colorFilter)
      ),
    [items, bookFilter, colorFilter]
  );

  const replace = (updated: Highlight) =>
    setItems((prev) => prev?.map((h) => (h.id === updated.id ? updated : h)) ?? prev);

  async function recolor(highlight: Highlight, color: HighlightColor) {
    if (highlight.color !== color) replace(await annotationService.updateColor(highlight, color));
  }

  function editNote(id: string | null) {
    editingNoteRef.current = id;
    setEditingNoteId(id);
  }

  async function saveNote(highlight: Highlight, value: string) {
    if (editingNoteRef.current !== highlight.id) return;
    editNote(null);
    const note = value.trim();
    if (note !== (highlight.note ?? '')) replace(await annotationService.updateNote(highlight, note));
  }

  async function remove(id: string) {
    await annotationService.remove(id);
    setItems((prev) => prev?.filter((h) => h.id !== id) ?? prev);
  }

  async function open(highlight: Highlight) {
    if (onOpenInBook && !(await onOpenInBook(highlight))) {
      setMissingBookIds((prev) => new Set(prev).add(highlight.bookId));
    }
  }

  return (
    <div className="hl-list">
      <header className="hl-list__header">
        <h1>Highlights</h1>
        <p className="hl-list__subtitle">Passages you've marked while reading.</p>
      </header>

      {items === null ? (
        <div className="hl-list__empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="hl-list__empty">
          <p>No highlights yet.</p>
          <p className="hl-list__empty-sub">Select text while reading, then pick a color to save a highlight here.</p>
        </div>
      ) : (
        <>
          <div className="hl-list__filters">
            {books.length > 1 && (
              <select
                className="hl-list__book-filter"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                aria-label="Filter by book"
              >
                <option value={ALL}>All books</option>
                {books.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            )}
            <div className="hl-list__color-filter" role="group" aria-label="Filter by color">
              <button
                className={'hl-list__color-all' + (colorFilter === ALL ? ' hl-list__color-all--active' : '')}
                aria-pressed={colorFilter === ALL}
                onClick={() => setColorFilter(ALL)}
              >
                All colors
              </button>
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={'hl-swatch' + (colorFilter === color ? ' hl-swatch--active' : '')}
                  style={{ background: HIGHLIGHT_FILL[color] }}
                  aria-pressed={colorFilter === color}
                  aria-label={`Only ${color}`}
                  onClick={() => setColorFilter(color)}
                />
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="hl-list__empty">
              <p>No highlights match.</p>
            </div>
          ) : (
            <div className="hl-list__grid">
              {visible.map((h) => (
                <div className={`hl-card hl-card--${h.color}`} key={h.id}>
                  <div className="hl-card__text" lang="ar" dir="auto">
                    {h.text}
                  </div>
                  <div className="hl-card__meta">
                    <span dir="auto">{h.bookTitle}</span>
                    {h.chapterLabel && (
                      <>
                        <span className="hl-card__dot">·</span>
                        <span dir="auto">{h.chapterLabel}</span>
                      </>
                    )}
                  </div>
                  {missingBookIds.has(h.bookId) && (
                    <div className="hl-card__warning" role="status">
                      This book is no longer in your library.
                    </div>
                  )}

                  {editingNoteId === h.id ? (
                    <textarea
                      className="hl-card__note-input"
                      defaultValue={h.note ?? ''}
                      rows={2}
                      placeholder="Add a note"
                      aria-label="Note"
                      autoFocus
                      onBlur={(e) => void saveNote(h, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void saveNote(h, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          editNote(null);
                        }
                      }}
                    />
                  ) : (
                    h.note && (
                      <button className="hl-card__note" onClick={() => editNote(h.id)} title="Edit note">
                        {h.note}
                      </button>
                    )
                  )}

                  <div className="hl-card__actions">
                    <div className="hl-card__colors" role="group" aria-label="Highlight color">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          className={'hl-swatch' + (h.color === color ? ' hl-swatch--active' : '')}
                          style={{ background: HIGHLIGHT_FILL[color] }}
                          aria-pressed={h.color === color}
                          aria-label={`Make ${color}`}
                          onClick={() => void recolor(h, color)}
                        />
                      ))}
                    </div>
                    <div className="hl-card__buttons">
                      {onOpenInBook && (
                        <button className="hl-card__action" onClick={() => void open(h)}>
                          Open in book
                        </button>
                      )}
                      {!h.note && editingNoteId !== h.id && (
                        <button className="hl-card__action" onClick={() => editNote(h.id)}>
                          Add note
                        </button>
                      )}
                      <button className="hl-card__remove" onClick={() => void remove(h.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
