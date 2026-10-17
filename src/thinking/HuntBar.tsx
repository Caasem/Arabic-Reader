import { useEffect } from 'react';
import type { DeskItem } from '../studyDesk/types';
import { wordsOf } from './labels';
import { short } from './passages';
import { say } from './say';
import { setThinking } from './state';

/** Under the reader's header while a masʾala is hunted: the question, what to do, and Cancel (Esc). */
export function HuntBar({ question, quiet }: { question: DeskItem; quiet: boolean }) {
  const cancel = () => {
    setThinking({ hunting: null, selected: null });
    say('Stopped looking');
  };
  // Esc stops looking, unless a bar or a composer is open (they close first).
  useEffect(() => {
    if (quiet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (document.querySelector('.dict-popup, [role="dialog"]')) return;
      cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quiet]);
  return (
    <div className="th-collect th-hunt" role="region" aria-label="Looking for an answer">
      <span className="th-kind th-kind--q">Hunting</span>
      <b className={question.ar ? 'th-ar th-collect__name' : 'th-collect__name'} dir="auto">
        {short(wordsOf(question), 80)}
      </b>
      <span className="th-collect__text">click the passage that answers it, or select new words</span>
      <button type="button" className="sd-btn th-btn--ghost" onClick={cancel}>
        Cancel <kbd>Esc</kbd>
      </button>
    </div>
  );
}
