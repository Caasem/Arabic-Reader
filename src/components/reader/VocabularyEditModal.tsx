import { useEffect, useMemo, useRef, useState } from 'react';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import './VocabularyEditModal.css';

/**
 * Compact modal over the reading page for editing a vocabulary card's own
 * fields -- word, meaning, and (via an interactive word-picker) its context
 * sentence. Reuses the existing flashcard data model (VocabularyItem) and
 * `vocabularyService.updateVocabularyItem` entirely; this is a UI layer on
 * top of state that already exists, not a parallel editing system.
 */
export function VocabularyEditModal({
  bookId,
  word,
  alreadySaved,
  fallbackMeaning,
  fallbackSentence,
  onCancel,
  onSave,
}: {
  bookId: string;
  word: string;
  /** Whether this word already has a saved card -- if so, load *its*
   * current meaning/sentence instead of the fresh lookup's. Edit can be
   * opened before the word is ever saved, to customize the card before it
   * exists. */
  alreadySaved: boolean;
  fallbackMeaning: string;
  fallbackSentence?: string;
  onCancel: () => void;
  onSave: (patch: { meaning: string; sentence: string | undefined; surfaceForm: string }) => Promise<void>;
}) {
  const [loading, setLoading] = useState(alreadySaved);
  const [surfaceForm, setSurfaceForm] = useState(word);
  const [meaning, setMeaning] = useState(fallbackMeaning);
  const [originalSentence, setOriginalSentence] = useState(fallbackSentence ?? '');
  const [contextText, setContextText] = useState(fallbackSentence ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!alreadySaved) return;
    let cancelled = false;
    vocabularyService.getForWord(bookId, word).then((items) => {
      if (cancelled || items.length === 0) {
        setLoading(false);
        return;
      }
      const item = items.find((i) => i.selectedEntryIndex === undefined) ?? items[0];
      setSurfaceForm(item.surfaceForm);
      setMeaning(item.meaning);
      setOriginalSentence(item.sentence ?? '');
      setContextText(item.sentence ?? '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, word, alreadySaved]);

  // Word-level context-sentence selection: press/drag across the tokenized
  // sentence to pick a contiguous range, which becomes the editable context
  // text below. Dragging is tracked with plain refs (not state) since it
  // fires on every pointer move and doesn't need to trigger its own render.
  const tokens = useMemo(() => originalSentence.split(/(\s+)/).filter((t) => t.length > 0), [originalSentence]);
  const wordTokenIndexes = useMemo(() => tokens.map((t, i) => (t.trim() ? i : -1)).filter((i) => i !== -1), [tokens]);
  const [selRange, setSelRange] = useState<[number, number] | null>(null);
  const dragAnchorRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  function applySelection(range: [number, number]) {
    setSelRange(range);
    setContextText(tokens.slice(range[0], range[1] + 1).join(''));
  }

  function handleTokenPointerDown(idx: number) {
    dragAnchorRef.current = idx;
    draggingRef.current = true;
    applySelection([idx, idx]);
  }
  function handleTokenPointerEnter(idx: number) {
    if (!draggingRef.current || dragAnchorRef.current === null) return;
    const anchor = dragAnchorRef.current;
    applySelection([Math.min(anchor, idx), Math.max(anchor, idx)]);
  }
  useEffect(() => {
    function stop() {
      draggingRef.current = false;
    }
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  function handleRestoreOriginal() {
    setSelRange(null);
    setContextText(originalSentence);
  }
  function handleDeleteContext() {
    setSelRange(null);
    setContextText('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ meaning: meaning.trim(), sentence: contextText.trim() || undefined, surfaceForm: surfaceForm.trim() || word });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vocab-edit-backdrop" onClick={onCancel}>
      <div className="vocab-edit" onClick={(e) => e.stopPropagation()}>
        <div className="vocab-edit__header">
          <span className="vocab-edit__title">Edit vocabulary</span>
          <button className="vocab-edit__close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        {loading ? (
          <div className="vocab-edit__loading">Loading…</div>
        ) : (
          <>
            <label className="vocab-edit__field">
              <span className="vocab-edit__label">Word</span>
              <input
                className="vocab-edit__input vocab-edit__input--arabic"
                dir="rtl"
                value={surfaceForm}
                onChange={(e) => setSurfaceForm(e.target.value)}
              />
            </label>

            <label className="vocab-edit__field">
              <span className="vocab-edit__label">Meaning</span>
              <textarea
                className="vocab-edit__input"
                dir="ltr"
                rows={2}
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
              />
            </label>

            <div className="vocab-edit__field">
              <span className="vocab-edit__label">Context sentence</span>
              {tokens.length > 0 ? (
                <div className="vocab-edit__tokens" dir="rtl">
                  {tokens.map((t, i) => {
                    if (!t.trim()) return <span key={i}>{t}</span>;
                    const selected = !!selRange && i >= selRange[0] && i <= selRange[1];
                    return (
                      <span
                        key={i}
                        className={'vocab-edit__token' + (selected ? ' vocab-edit__token--selected' : '')}
                        onPointerDown={() => handleTokenPointerDown(i)}
                        onPointerEnter={() => handleTokenPointerEnter(i)}
                      >
                        {t}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="vocab-edit__note">No original sentence captured for this word.</p>
              )}
              {wordTokenIndexes.length > 0 && (
                <p className="vocab-edit__hint">Tap a word, or drag across a range, to pick the context below.</p>
              )}
              <textarea
                className="vocab-edit__input vocab-edit__input--arabic"
                dir="rtl"
                rows={2}
                value={contextText}
                onChange={(e) => {
                  setSelRange(null);
                  setContextText(e.target.value);
                }}
                placeholder="No context sentence"
              />
              <div className="vocab-edit__context-actions">
                <button className="vocab-edit__link-btn" onClick={handleRestoreOriginal} disabled={!originalSentence}>
                  Restore original
                </button>
                <button className="vocab-edit__link-btn" onClick={handleDeleteContext} disabled={!contextText}>
                  Delete context
                </button>
              </div>
            </div>

            <div className="vocab-edit__actions">
              <button className="btn btn--ghost" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Vocabulary'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
