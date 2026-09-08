import { useEffect, useState } from 'react';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { BackupControls } from '../shared/BackupControls';
import type { VocabularyItem } from '../../types';
import './VocabularyList.css';

export function VocabularyList() {
  const [items, setItems] = useState<VocabularyItem[] | null>(null);

  useEffect(() => {
    vocabularyService.list().then(setItems);
  }, []);

  return (
    <div className="vocab">
      <header className="vocab__header">
        <div className="vocab__header-row">
          <div>
            <h1>Vocabulary</h1>
            <p className="vocab__subtitle">Words you've chosen to learn, saved from your reading.</p>
          </div>
          <BackupControls compact />
        </div>
      </header>

      {items === null ? (
        <div className="vocab__empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="vocab__empty">
          <p>No saved words yet.</p>
          <p className="vocab__empty-sub">Tap a word while reading, then “Add to vocabulary” to build your list here.</p>
        </div>
      ) : (
        <div className="vocab__list">
          {items.map((item) => (
            <div className="vocab-card" key={item.id}>
              <div className="vocab-card__word">{item.surfaceForm}</div>
              <div className="vocab-card__meaning">{item.meaning}</div>
              {item.sentence && <div className="vocab-card__sentence">“{item.sentence}”</div>}
              <div className="vocab-card__meta">
                <span>{item.bookTitle}</span>
                <span className="vocab-card__dot">·</span>
                <span className="vocab-card__mastery">{item.mastery}</span>
              </div>
              <div className="vocab-card__stats">
                {item.encounterCount} encounter{item.encounterCount === 1 ? '' : 's'} · {item.lookupCount} lookup
                {item.lookupCount === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
