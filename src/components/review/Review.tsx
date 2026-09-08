import { useEffect, useMemo, useState } from 'react';
import { vocabularyService, formatDueIn, type ReviewGrade } from '../../vocabulary/vocabularyService';
import { BackupControls } from '../shared/BackupControls';
import type { VocabularyItem } from '../../types';
import './Review.css';

const STATE_LABELS = ['New', 'Learning', 'Review', 'Relearning'];

const GRADE_BUTTONS: { grade: ReviewGrade; label: string; className: string }[] = [
  { grade: 'again', label: 'Again', className: 'review__btn--again' },
  { grade: 'hard', label: 'Hard', className: 'review__btn--hard' },
  { grade: 'good', label: 'Good', className: 'review__btn--good' },
  { grade: 'easy', label: 'Easy', className: 'review__btn--easy' },
];

/**
 * Spaced-repetition review — an FSRS-scheduled flashcard flow over the
 * saved Vocabulary list (see vocabularyService.ts for the algorithm
 * itself; this component is just the UI over it). Front = the Arabic word
 * (+ sentence context, if captured); flip to see the meaning, then grade
 * recall on the same four-point Again/Hard/Good/Easy scale Anki uses —
 * each button previews the interval it would schedule, computed by
 * `previewGrades()` without committing anything until one is picked.
 */
export function Review() {
  const [queue, setQueue] = useState<VocabularyItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [totalDueAtStart, setTotalDueAtStart] = useState(0);

  useEffect(() => {
    loadQueue();
  }, []);

  function loadQueue() {
    vocabularyService.getDueForReview().then((items) => {
      setQueue(items);
      setTotalDueAtStart(items.length);
      setIndex(0);
      setFlipped(false);
      setSessionDone(0);
    });
  }

  const current = queue?.[index];

  // Computed once per card (not per render) — previewGrades() runs the
  // scheduler for all four grades, so it's worth memoizing on the card's
  // own id rather than recomputing on every flip/re-render.
  const previews = useMemo(() => (current ? vocabularyService.previewGrades(current) : null), [current?.id]);

  async function answer(grade: ReviewGrade) {
    if (!current) return;
    await vocabularyService.recordReviewResult(current, grade);
    setSessionDone((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  if (queue === null) {
    return (
      <div className="review">
        <div className="review__empty">Loading…</div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="review">
        <header className="review__header">
          <h1>Review</h1>
          <BackupControls compact />
        </header>
        <div className="review__empty">
          {totalDueAtStart === 0 ? (
            <>
              <p>Nothing due for review right now.</p>
              <p className="review__empty-sub">
                Save words while reading, then come back once they're due — new words are due immediately, so this is
                probably empty because you haven't saved any yet, or you've already reviewed everything that's due.
              </p>
            </>
          ) : (
            <>
              <p>All caught up — {sessionDone} card{sessionDone === 1 ? '' : 's'} reviewed.</p>
              <button className="btn btn--ghost" onClick={loadQueue}>
                Check again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="review">
      <header className="review__header">
        <h1>Review</h1>
        <div className="review__header-right">
          <span className="review__progress-label">
            {index + 1} of {queue.length}
          </span>
          <BackupControls compact />
        </div>
      </header>

      <div className="review__card" onClick={() => setFlipped((f) => !f)}>
        <div className="review__card-box">{STATE_LABELS[current.fsrsState] ?? 'New'}</div>
        <div className="review__card-word">{current.surfaceForm}</div>
        {!flipped && <div className="review__card-hint">Tap to reveal</div>}
        {flipped && (
          <div className="review__card-back">
            <div className="review__card-meaning">{current.meaning}</div>
            {current.sentence && <div className="review__card-sentence">“{current.sentence}”</div>}
            {current.root && (
              <div className="review__card-root">
                <span>Root</span> {current.root}
              </div>
            )}
            <div className="review__card-source">{current.bookTitle}</div>
          </div>
        )}
      </div>

      {flipped ? (
        <div className="review__actions review__actions--grades">
          {GRADE_BUTTONS.map(({ grade, label, className }) => (
            <button key={grade} className={'review__btn ' + className} onClick={() => answer(grade)}>
              <span className="review__btn-label">{label}</span>
              {previews && <span className="review__btn-interval">{formatDueIn(previews[grade].dueAt)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="review__actions">
          <button className="review__btn review__btn--reveal" onClick={() => setFlipped(true)}>
            Reveal
          </button>
        </div>
      )}
    </div>
  );
}
