import { useEffect, useRef, useState } from 'react';

/** The popup's headword: click it to correct it (a misread scan, a typo); Enter looks up the corrected word, Esc cancels. */
export function EditableWord({ word, suspect, onCommit }: { word: string; suspect: boolean; onCommit: (word: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(word);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!cancelled.current && next && next !== word) onCommit(next);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={'dict-popup__word-text' + (suspect ? ' dict-popup__word-text--suspect' : '')}
        title="Click to correct this word"
        aria-label={`Correct the word ${word}`}
        onClick={() => {
          cancelled.current = false;
          setDraft(word);
          setEditing(true);
        }}
      >
        {word}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      className="dict-popup__word-input"
      dir="rtl"
      lang="ar"
      value={draft}
      size={Math.max(draft.length, 3)}
      aria-label="Correct the word"
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          inputRef.current?.blur();
        }
      }}
      onBlur={commit}
    />
  );
}
