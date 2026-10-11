import { useEffect, useRef, useState } from 'react';

/** A root/lemma value that shows the Arabic text by default; tapping it
 * crossfades to the "root"/"form" label in the exact same spot, then fades
 * back to the value after a moment. Replaces a static always-visible label
 * — the label only appears when asked for, right where the value was. */
export function MorphValue({ kind, value, label }: { kind: 'form' | 'root'; value: string; label?: string }) {
  const [revealed, setRevealed] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  function handleTap() {
    setRevealed(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setRevealed(false), 1400);
  }

  return (
    <span
      className="dict-popup__morph-item"
      data-kind={kind}
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-label={`${kind}: ${value}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleTap();
        }
      }}
    >
      <span className={'dict-popup__morph-swap' + (revealed ? ' dict-popup__morph-swap--label' : '')}>
        <bdi className="dict-popup__entry-morph-value dict-popup__morph-face" aria-hidden={revealed}>
          {value}
        </bdi>
        <span className="dict-popup__morph-face dict-popup__morph-face--label" aria-hidden={!revealed}>
          {label ?? kind}
        </span>
      </span>
    </span>
  );
}
