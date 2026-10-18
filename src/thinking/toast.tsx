import { useEffect } from 'react';
import { runUndo, useToast } from './say';

export function ThinkingToast() {
  const t = useToast();
  // Ctrl+Z while an undo is offered, unless typing.
  useEffect(() => {
    if (!t?.undo) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      runUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t]);
  if (!t) return null;
  return (
    <div className={'sd-toast th-toast' + (t.undo ? ' sd-toast--undo' : '')} role="status">
      <span>{t.text}</span>
      {t.undo && (
        <button type="button" onClick={runUndo}>
          Undo <kbd>Ctrl Z</kbd>
        </button>
      )}
    </div>
  );
}
