import { useState } from 'react';
import type { Clip, ClipVocabWord } from './types';

const TRAILING_PUNCT_RE = /[،؛؟.!]+$/;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The clip's transcript, line by line, with taught vocabulary words
 * highlighted and tappable -- tap one to reveal its meaning inline, no
 * separate popover positioning to get right.
 */
export function Transcript({ clip }: { clip: Clip }) {
  const vocabByForm = new Map<string, ClipVocabWord>(clip.vocab.map((w) => [w.surfaceForm, w]));
  const [openWord, setOpenWord] = useState<string | null>(null);

  return (
    <div className="transcript">
      {clip.transcript.map((segment) => (
        <p key={segment.startSec} className="transcript__line">
          <span className="transcript__time">{formatTime(segment.startSec)}</span>
          {segment.text.split(/\s+/).map((word, i) => {
            const bare = word.replace(TRAILING_PUNCT_RE, '');
            const vocabWord = vocabByForm.get(bare);
            if (!vocabWord) return <span key={i}> {word}</span>;
            const isOpen = openWord === bare;
            return (
              <span key={i}>
                {' '}
                <button
                  className={'transcript__word' + (isOpen ? ' transcript__word--open' : '')}
                  onClick={() => setOpenWord(isOpen ? null : bare)}
                >
                  {word}
                </button>
                {isOpen && <span className="transcript__meaning">({vocabWord.meaning})</span>}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
