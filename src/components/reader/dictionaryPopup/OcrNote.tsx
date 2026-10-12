import { useEffect, useMemo } from 'react';
import type { WordOcrInfo } from '../../../types';
import { Alternative } from './Alternative';

/**
 * Under the headword of a word read from a scan: a warning and ranked corrections when the dictionary
 * does not know the read, a "Corrected" mark after the reader fixes it, and a note when a closer look
 * or another engine produced the word. The keys 1-3 take a correction.
 */
export function OcrNote({ ocr, onPick }: { ocr: WordOcrInfo; onPick: (word: string) => void }) {
  const choices = useMemo(() => (ocr.suspect ? ocr.candidates : []), [ocr.suspect, ocr.candidates]);
  useEffect(() => {
    if (!choices.length) return;
    function onKey(e: KeyboardEvent) {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > choices.length || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      onPick(choices[n - 1].word);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, onPick]);

  if (ocr.corrected) return <div className="dict-popup__ocr-note dict-popup__ocr-note--ok">Corrected from the scan’s “{ocr.read}”. Remembered for this book.</div>;
  if (ocr.suspect) {
    return (
      <div className="dict-popup__ocr">
        <div className="dict-popup__ocr-note dict-popup__ocr-note--warn">Not a known word. Scans often drop a dot or merge letters; click the word to correct it{choices.length ? ', or pick one:' : '.'}</div>
        {choices.length > 0 && (
          <div className="dict-popup__alts" role="group" aria-label="Did you mean">
            {choices.map((c, i) => (
              <Alternative key={c.word} word={c.word} why={c.why} index={i} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (ocr.via === 'remembered') return <div className="dict-popup__ocr-note">Remembered from your earlier correction</div>;
  if (ocr.via !== 'first read') return <div className="dict-popup__ocr-note">Read again, {ocr.via.startsWith('a ') ? ocr.via : `by ${ocr.via}`}, to get a word</div>;
  return null;
}
