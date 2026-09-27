import { useState } from 'react';
import type { ClipVocabWord } from './types';

/**
 * Inline flashcard practice, reused for both the pre-teach pass (before
 * watching) and the recap pass (after). Renders in place -- part of the
 * page's normal flow, not an overlay -- so it never hides the vocab list,
 * video, or transcript above and below it.
 */
export function FlashcardPanel({
  words,
  onClose,
  onComplete,
}: {
  words: ClipVocabWord[];
  onClose: () => void;
  onComplete: (known: Set<string>) => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());

  const current = words[index];

  function grade(isKnown: boolean) {
    const next = isKnown ? new Set(known).add(current.surfaceForm) : known;
    setKnown(next);
    setFlipped(false);
    if (index + 1 < words.length) {
      setIndex(index + 1);
    } else {
      onComplete(next);
    }
  }

  return (
    <div className="panel">
      <div className="panel__top">
        <span className="panel__progress">
          {index + 1} / {words.length}
        </span>
        <button className="panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="panel__card" onClick={() => !flipped && setFlipped(true)}>
        <span className="panel__word" lang="ar" dir="rtl">
          {current.surfaceForm}
        </span>
        <span className="panel__meaning">{flipped ? current.meaning : '···'}</span>
      </div>
      {flipped ? (
        <div className="panel__actions">
          <button className="link link--miss" onClick={() => grade(false)}>
            Didn't know it
          </button>
          <button className="link link--hit" onClick={() => grade(true)}>
            Knew it
          </button>
        </div>
      ) : (
        <div className="panel__actions">
          <button className="link" onClick={() => setFlipped(true)}>
            Reveal
          </button>
        </div>
      )}
    </div>
  );
}
