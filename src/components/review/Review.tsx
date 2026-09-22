import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { vocabularyService, formatDueIn, type ReviewGrade } from '../../vocabulary';
import { useArabicSpeech } from '../../utils/speech';
import { BackupControls } from '../shared/BackupControls';
import { IconEdit } from '../shared/icons';
import type { VocabularyItem } from '../../types';
import './Review.css';

type EditableField = 'meaning' | 'sentence';

const STATE_LABELS = ['New', 'Learning', 'Review', 'Relearning'];

const GRADE_BUTTONS: { grade: ReviewGrade; label: string; key: string; className: string }[] = [
  { grade: 'again', label: 'Again', key: '1', className: 'review__btn--again' },
  { grade: 'hard', label: 'Hard', key: '2', className: 'review__btn--hard' },
  { grade: 'good', label: 'Good', key: '3', className: 'review__btn--good' },
  { grade: 'easy', label: 'Easy', key: '4', className: 'review__btn--easy' },
];

/** A card that comes due again this soon (typically one just missed) is
 * shown again later in the same session. */
const REQUEUE_WITHIN_MS = 5 * 60_000;

/**
 * FSRS flashcard review over saved vocabulary (scheduling lives in
 * vocabularyService). Front: the word, plus its sentence if captured. Flip,
 * then grade recall Again/Hard/Good/Easy; each button previews the interval
 * it would schedule. Keyboard: Space or Enter reveals, 1–4 grade.
 */
export function Review() {
  const [queue, setQueue] = useState<VocabularyItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [totalDueAtStart, setTotalDueAtStart] = useState(0);
  // Inline editing of the card's meaning or sentence.
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Guards against grading one card twice with fast key presses.
  const answeringRef = useRef(false);
  const speak = useArabicSpeech();

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    if (editingField) editInputRef.current?.focus();
  }, [editingField]);

  const current = queue?.[index];

  // previewGrades() runs the scheduler for all four grades -- memoized per card.
  const previews = useMemo(() => (current ? vocabularyService.previewGrades(current) : null), [current]);

  const answerRef = useRef(answer);
  useLayoutEffect(() => {
    answerRef.current = answer;
  });

  useEffect(() => {
    if (!current || editingField) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!flipped) {
        // A focused button already handles Space/Enter itself.
        if ((e.key === ' ' || e.key === 'Enter') && !target?.closest('button')) {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const grade = GRADE_BUTTONS.find((b) => b.key === e.key)?.grade;
      if (grade) {
        e.preventDefault();
        void answerRef.current(grade);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, flipped, editingField]);

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

  function startEdit(field: EditableField, e: React.MouseEvent) {
    e.stopPropagation(); // don't also flip the card
    if (!current) return;
    setDraftValue(field === 'meaning' ? current.meaning : (current.sentence ?? ''));
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

  async function answer(grade: ReviewGrade) {
    if (!current || answeringRef.current) return;
    answeringRef.current = true;
    try {
      setEditingField(null);
      const updated = await vocabularyService.recordReviewResult(current, grade);
      if (updated.fsrsDue - Date.now() <= REQUEUE_WITHIN_MS) {
        setQueue((prev) => (prev ? [...prev, updated] : prev));
      }
      setSessionDone((n) => n + 1);
      setFlipped(false);
      setIndex((i) => i + 1);
    } finally {
      answeringRef.current = false;
    }
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
              <p>
                All caught up — {sessionDone} review{sessionDone === 1 ? '' : 's'} this session.
              </p>
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

      <div className="review__card" onClick={() => setFlipped((f) => !f)} aria-live="polite">
        {speak && (
          <button
            className="review__speak"
            onClick={(e) => {
              e.stopPropagation();
              speak(current.surfaceForm);
            }}
            aria-label="Pronounce"
            title="Pronounce"
          >
            Listen
          </button>
        )}
        <div className="review__card-box">{STATE_LABELS[current.fsrsState] ?? 'New'}</div>
        <div className="review__card-word" lang="ar" dir="rtl">
          {current.surfaceForm}
        </div>
        {!flipped && <div className="review__card-hint">Tap to reveal</div>}
        {flipped && (
          <div className="review__card-back">
            {editingField === 'meaning' ? (
              <input
                ref={editInputRef as React.RefObject<HTMLInputElement>}
                className="review__card-edit-input"
                dir="ltr"
                aria-label="Meaning"
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
                lang="ar"
                aria-label="Context sentence"
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
                <span className="review__card-sentence" lang="ar">
                  “{current.sentence}”
                </span>
                <IconEdit size={12} className="review__card-field-icon" />
              </div>
            ) : (
              <button className="review__card-add-sentence" onClick={(e) => startEdit('sentence', e)}>
                + Add context sentence
              </button>
            )}

            {current.root && (
              <div className="review__card-root">
                <span>Root</span> <bdi lang="ar">{current.root}</bdi>
              </div>
            )}
            <div className="review__card-source" dir="auto">
              {current.bookTitle}
            </div>
          </div>
        )}
      </div>

      {flipped ? (
        <div className="review__actions review__actions--grades">
          {GRADE_BUTTONS.map(({ grade, label, key, className }) => (
            <button
              key={grade}
              className={'review__btn ' + className}
              onClick={() => answer(grade)}
              aria-keyshortcuts={key}
            >
              <span className="review__btn-label">{label}</span>
              {previews && <span className="review__btn-interval">{formatDueIn(previews[grade].dueAt)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="review__actions">
          <button className="review__btn review__btn--reveal" onClick={() => setFlipped(true)} aria-keyshortcuts="Space">
            Reveal
          </button>
        </div>
      )}
      <p className="review__shortcuts" aria-hidden="true">
        {flipped ? 'Keys 1–4 grade' : 'Space to reveal'}
      </p>
    </div>
  );
}
