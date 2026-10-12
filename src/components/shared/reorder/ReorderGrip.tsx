import type { ComponentProps } from 'react';
import './reorder.css';

/**
 * The grip you hold to drag a row: a button (so it takes focus, and the arrow keys move the row when it
 * has it). Spread `useReorder().handleProps(id)` onto it.
 */
export function ReorderGrip({ name, index, count, ...rest }: { name: string; index: number; count: number } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="reorder-grip reorder-handle"
      aria-label={`Move ${name} (position ${index + 1} of ${count})`}
      title="Drag to reorder, or use the arrow keys"
      {...rest}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
        <path d="M9 5v.01M9 12v.01M9 19v.01M15 5v.01M15 12v.01M15 19v.01" />
      </svg>
    </button>
  );
}
