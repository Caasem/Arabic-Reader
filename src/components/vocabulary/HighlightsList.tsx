import { useEffect, useState } from 'react';
import { annotationService } from '../../reader/annotations/annotationService';
import type { Highlight } from '../../types';
import './HighlightsList.css';

export function HighlightsList() {
  const [items, setItems] = useState<Highlight[] | null>(null);

  useEffect(() => {
    annotationService.listAll().then(setItems);
  }, []);

  async function remove(id: string) {
    await annotationService.remove(id);
    setItems((prev) => prev?.filter((h) => h.id !== id) ?? prev);
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
        <div className="hl-list__grid">
          {items.map((h) => (
            <div className={`hl-card hl-card--${h.color}`} key={h.id}>
              <div className="hl-card__text">{h.text}</div>
              <div className="hl-card__meta">
                <span>{h.bookTitle}</span>
                {h.chapterLabel && (
                  <>
                    <span className="hl-card__dot">·</span>
                    <span>{h.chapterLabel}</span>
                  </>
                )}
              </div>
              {h.note && <div className="hl-card__note">{h.note}</div>}
              <button className="hl-card__remove" onClick={() => remove(h.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
