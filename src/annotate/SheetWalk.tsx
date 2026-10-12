import { useEffect, useMemo, useRef, useState } from 'react';
import { hiddenAfter, walkOrder } from './sketchCards';
import { sketchSvg } from './toMargin';
import type { Sketch } from './types';

/**
 * Review sheet: a practice walk-through over the sketch panel. Every label starts hidden; Space, Enter or a tap
 * reveals the next one in tree order (sketchCards.ts), Backspace takes one back, Esc ends. Nothing is graded
 * or scheduled, and nothing on the sheet changes.
 */
export function SheetWalk({ sketch, onClose }: { sketch: Sketch; onClose(): void }) {
  const order = useMemo(() => walkOrder(sketch), [sketch]);
  const [step, setStep] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = step >= order.length;

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([sketchSvg(sketch, { hide: hiddenAfter(order, step) }).svg], { type: 'image/svg+xml' }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [sketch, order, step]);

  const next = () => (done ? onClose() : setStep((n) => n + 1));
  const nextRef = useRef(next);
  nextRef.current = next;

  useEffect(() => {
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === 'Escape') return stop(), onClose();
      if (e.code === 'Space' || e.key === 'Enter') {
        // A focused button does its own press.
        if ((e.target as HTMLElement | null)?.closest('button')) return;
        return stop(), nextRef.current();
      }
      if (e.key === 'Backspace' || e.key === 'ArrowLeft') return stop(), setStep((n) => Math.max(0, n - 1));
      if (e.key === 'ArrowRight') return stop(), nextRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div ref={root} className="sk-walk" tabIndex={-1} role="region" aria-label="Review sheet">
      <div className="sk-walk__sheet" onClick={next}>
        {src && <img src={src} alt={`The sheet with ${order.length - step} of ${order.length} labels hidden`} draggable={false} />}
      </div>
      <div className="sk-walk__bar">
        <span role="status">{done ? 'All revealed' : `${step} of ${order.length} revealed`}</span>
        <span className="sk-grow" />
        <button type="button" onClick={next} aria-keyshortcuts="Space">
          {done ? 'Finish' : 'Reveal next'}
        </button>
        <button type="button" onClick={onClose} aria-keyshortcuts="Escape">
          End
        </button>
      </div>
    </div>
  );
}
