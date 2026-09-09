import { useEffect, useMemo, useRef, useState } from 'react';
import { vocabularyService, formatDueIn, type ReviewGrade } from '../../vocabulary/vocabularyService';
import { BackupControls } from '../shared/BackupControls';
import { IconEdit } from '../shared/icons';
import type { VocabularyItem } from '../../types';
import './Review.css';

type EditableField = 'meaning' | 'sentence';

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
  // Inline editing (feature request: no popup for normal flashcard editing)
  // -- which field is currently being edited, and its in-progress value.
  // Reuses vocabularyService.updateVocabularyItem, the same call
  // VocabularyList's own inline editor already uses, rather than a second
  // editing model.
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    if (editingField) editInputRef.current?.focus();
  }, [editingField]);

  function loadQueue() {
    vocabularyService.getDueForReview().then((items) => {
      setQueue(items);
      setTotalDueAtStart(items.length);
      setIndex(0);
      setFlipped(false);
      setSessionDone(0);
      setEditingField(null);
    });
  }

  const current = queue?.[index];

  function startEdit(field: EditableField, e: React.MouseEvent) {
    e.stopPropagation(); // don't also flip the card
    if (!current) return;
    setDraftValue(field === 'meaning' ? current.meaning : current.sentence ?? '');
    setEditingField(field);
  }

  async function commitEdit() {
    if (!current || !editingField) return;
    const field = editingField;
    const value = draftValue.trim();
    setEditingField(null);
    if (field === 'meaning' && value === current.meaning) return;
    if (field === 'sentence' && value === (current.sentence ?? '')) return;
    const updated = await vocabularyService.updateVocabularyItem(current, {
      [field]: field === 'sentence' ? value || undefined : value,
    } as Partial<Pick<VocabularyItem, 'meaning' | 'sentence'>>);
    setQueue((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev);
  }

  function cancelEdit() {
    setEditingField(null);
  }

  // Computed once per card (not per render) — previewGrades() runs the
  // scheduler for all four grades, so it's worth memoizing on the card's
  // own id rather than recomputing on every flip/re-render.
  const previews = useMemo(() => (current ? vocabularyService.previewGrades(current) : null), [current?.id]);

  async function answer(grade: ReviewGrade) {
    if (!current) return;
    setEditingField(null);
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
            {editingField === 'meaning' ? (
              <input
                ref={editInputRef as React.RefObject<HTMLInputElement>}
                className="review__card-edit-input"
                dir="ltr"
                value={draftValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
            ) : (
              <div className="review__card-field" onClick={(e) => startEdit('meaning', e)}>
                <span className="review__card-meaning">{current.meaning}</span>
                <IconEdit size={12} className="review__card-field-icon" />
              </div>
            )}

            {editingField === 'sentence' ? (
              <textarea
                ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                className="review__card-edit-input review__card-edit-input--arabic"
                dir="rtl"
                rows={2}
                value={draftValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
            ) : current.sentence ? (
              <div className="review__card-field" onClick={(e) => startEdit('sentence', e)}>
                <span className="review__card-sentence">“{current.sentence}”</span>
                <IconEdit size={12} className="review__card-field-icon" />
              </div>
            ) : (
              <button className="review__card-add-sentence" onClick={(e) => startEdit('sentence', e)}>
                + Add context sentence
              </button>
            )}

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
