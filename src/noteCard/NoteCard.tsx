import { useEffect, useRef, useState } from 'react';
import type { HighlightColor } from '../types';
import { FloatingCard } from '../floatingCard';
import { getReaderMarks, subscribeReaderSelection, type MarkCapture } from '../readerChords';

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];
const COLOR_KEY = 'noteCard.color';

function loadColor(): HighlightColor {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    return COLORS.includes(raw as HighlightColor) ? (raw as HighlightColor) : 'yellow';
  } catch {
    return 'yellow';
  }
}

/** The Alt+N card: writes a note on the selected text (or the first sentence on the page) and keeps floating so notes can be taken while reading on. */
export function NoteCard({ onClose }: { onClose(): void }) {
  const marks = getReaderMarks();
  const [capture, setCapture] = useState<MarkCapture | null>(() => marks?.captureSelection() ?? null);
  const [page, setPage] = useState<MarkCapture | null>(null);
  const [text, setText] = useState(() => {
    const first = marks?.captureSelection();
    return (first && marks?.existing(first)?.note) || '';
  });
  const [touched, setTouched] = useState(false);
  const [color, setColor] = useState(loadColor);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const touchedRef = useRef(touched);
  useEffect(() => {
    touchedRef.current = touched;
  });

  useEffect(() => {
    inputRef.current?.focus();
    // Measuring the page updates the reader's own state, so it can't happen while this card renders.
    setPage(marks?.capturePage() ?? null);
  }, [marks]);

  // A new selection in the book becomes the thing the note is about; clicking into this card clears the
  // selection, which must not lose it.
  useEffect(
    () =>
      subscribeReaderSelection(() => {
        const next = marks?.captureSelection();
        if (!next) return;
        setCapture(next);
        setStatus(null);
        if (!touchedRef.current) setText(marks?.existing(next)?.note ?? '');
      }),
    [marks]
  );

  const target = capture ?? page;
  const existing = capture ? marks?.existing(capture) : null;
  const canSave = !!marks && !!target && !!text.trim();

  async function save() {
    if (!marks) return;
    const place = capture ?? marks.capturePage();
    if (!place || !text.trim()) return;
    try {
      await marks.saveNote(place, text.trim(), color);
      setStatus('saved');
      setText('');
      setTouched(false);
      setConfirmDiscard(false);
      setCapture(null);
      setPage(marks.capturePage());
      inputRef.current?.focus();
    } catch {
      setStatus('failed');
    }
  }

  // Escape never throws away typed text without asking.
  const escapeRef = useRef<() => void>(() => {});
  useEffect(() => {
    escapeRef.current = () => {
      if (touched && text.trim() && !confirmDiscard) setConfirmDiscard(true);
      else onClose();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escapeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function pickColor(next: HighlightColor) {
    setColor(next);
    try {
      localStorage.setItem(COLOR_KEY, next);
    } catch {
      // The colour just won't be remembered.
    }
  }

  return (
    <FloatingCard
      label="Note"
      keyHint="Alt N"
      posKey="noteCard.floatingPos"
      defaultPos={() => ({ x: 24, y: 96 })}
      onClose={onClose}
    >
      <div onFocusCapture={() => marks && setPage(marks.capturePage())} className="fcard__stack">
        {!marks ? (
          <p className="fcard__hint">Notes aren&apos;t available in this reader.</p>
        ) : target ? (
          <>
            <p className="fcard__hint">
              {capture ? (existing ? 'Editing the note on this highlight' : 'Note on the selected text') : 'Note on the first sentence on this page'}
            </p>
            <blockquote className="fcard__quote" dir="auto">
              {target.text}
            </blockquote>
          </>
        ) : (
          <p className="fcard__hint">Select text in the book to attach a note to it.</p>
        )}
        <textarea
          ref={inputRef}
          className="fcard__input"
          dir="auto"
          rows={4}
          placeholder="Write a note…"
          aria-label="Note"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTouched(true);
            setStatus(null);
            setConfirmDiscard(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="fcard__row">
          <div className="fcard__dots" role="group" aria-label="Highlight colour">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={'fcard__dot fcard__dot--' + c}
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => pickColor(c)}
              />
            ))}
          </div>
          <span className="fcard__spacer" />
          <button type="button" className="fcard__btn fcard__btn--primary" disabled={!canSave} onClick={() => void save()}>
            Save
          </button>
        </div>
        <p className={'fcard__hint' + (status === 'saved' ? ' fcard__hint--ok' : '')} role="status">
          {confirmDiscard
            ? 'Press Esc again to discard this note.'
            : status === 'saved'
              ? 'Saved. Select more text to add another.'
              : status === 'failed'
                ? 'Could not save the note.'
                : 'Ctrl+Enter saves. Alt+N or Esc closes.'}
        </p>
      </div>
    </FloatingCard>
  );
}
