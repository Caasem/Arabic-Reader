import { useState } from 'react';
import type { Clip, ClipVocabWord } from './types';

const TRAILING_PUNCT_RE = /[،؛؟.!]+$/;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The clip's transcript, line by line. Every word the lesson has a meaning
 * for -- curated vocab or the rest of the glossary -- is hoverable (and
 * tappable, for touch) to show its meaning, with an "Add" action for
 * words not already in the vocab list.
 *
 * Two-state model on purpose: `pinned` (set by click, persists) and
 * `hovered` (set by mouse enter/leave, transient, only shown when nothing
 * is pinned). A single toggle-on-click driven by hover state doesn't work
 * here -- hovering a word would open it, then the click that follows
 * immediately toggles it closed again, and moving the mouse from the word
 * to its "+ Add" button (a sibling, not a child) would close the popover
 * via mouseleave before the click on Add ever lands.
 */
export function Transcript({
  clip,
  vocabForms,
  onAddWord,
}: {
  clip: Clip;
  /** Surface forms already in the lesson's vocab list (curated + added),
   * so already-added words don't offer "Add" again. */
  vocabForms: Set<string>;
  onAddWord: (word: ClipVocabWord) => void;
}) {
  const wordByForm = new Map<string, ClipVocabWord>([...clip.vocab, ...clip.glossary].map((w) => [w.surfaceForm, w]));
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const openWord = pinned ?? hovered;

  return (
    <div className="transcript">
      {clip.transcript.map((segment) => (
        <p key={segment.startSec} className="transcript__line">
          <span className="transcript__time">{formatTime(segment.startSec)}</span>
          {segment.text.split(/\s+/).map((word, i) => {
            const bare = word.replace(TRAILING_PUNCT_RE, '');
            const entry = wordByForm.get(bare);
            if (!entry) return <span key={i}> {word}</span>;
            const isOpen = openWord === bare;
            const inVocab = vocabForms.has(bare);
            return (
              <span
                key={i}
                onMouseEnter={() => setHovered(bare)}
                onMouseLeave={() => setHovered((cur) => (cur === bare ? null : cur))}
              >
                {' '}
                <button
                  className={'transcript__word' + (inVocab ? ' transcript__word--taught' : '')}
                  onClick={() => setPinned(pinned === bare ? null : bare)}
                >
                  {word}
                </button>
                {isOpen && (
                  <span className="transcript__meaning">
                    ({entry.meaning})
                    {!inVocab && (
                      <button
                        className="link transcript__add"
                        onClick={() => {
                          onAddWord(entry);
                          setPinned(bare);
                        }}
                      >
                        + Add
                      </button>
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
