import type { ReactNode } from 'react';
import type { CardKind } from './types';

const svg = (children: ReactNode, size = 12) => (
  <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" focusable="false">
    {children}
  </svg>
);
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconPin = () => svg(<path d="M7.4 1.5l3.1 3.1-1.6.5-1.7 2 .2 2.1-.9.9-2.1-2.1-2.6 2.6-.7-.7 2.6-2.6L1.6 5.2l.9-.9 2.1.2 2-1.7z" fill="currentColor" />, 11);
export const IconSwap = () => svg(<path d="M2 4h7.5M7.5 2l2 2-2 2M10 8H2.5M4.5 6l-2 2 2 2" {...line} />);
export const IconAddNote = () => svg(<path d="M1.8 3h5M1.8 6h3.4M1.8 9h3.4M9 6v4M7 8h4" {...line} />);
export const IconAddNode = () => (
  svg(
    <>
      <circle cx="3.6" cy="6" r="2" fill="currentColor" />
      <path d="M8.8 3.5v5M6.3 6h5" {...line} />
    </>
  )
);
export const IconUnlink = () => svg(<path d="M5 7l2-2M4.4 3.6l.8-.8a2 2 0 0 1 2.8 2.8l-.4.4M7.6 8.4l-.8.8a2 2 0 0 1-2.8-2.8l.4-.4M2 2l1 1M10 10l-1-1" {...line} strokeWidth={1.1} />);
export const IconChevron = () => svg(<path d="M4 2.5L7.5 6 4 9.5" {...line} strokeWidth={1.6} />, 10);
export const IconCarry = () => svg(<path d="M6 1.5v6.5M3.6 5.6L6 8l2.4-2.4M2.5 10.5h7" {...line} />);
export const IconTrash = () => svg(<path d="M2.5 3.5h7M5 3.5V2.2h2v1.3M3.4 3.5l.4 6.3h4.4l.4-6.3" {...line} />);

/** The small round badge that says what kind of card it is. */
export function KindIcon({ kind }: { kind: CardKind }) {
  switch (kind) {
    case 'quote':
      return <span aria-hidden="true">{'“'}</span>;
    case 'question':
      return <span aria-hidden="true">?</span>;
    case 'card':
      return svg(
        <>
          <rect x="1.8" y="2.8" width="8.4" height="6.4" rx="1.2" {...line} />
          <path d="M1.8 5.3h8.4" {...line} />
        </>
      );
    case 'ink':
      return svg(<path d="M1.5 8.5c1.4-3.2 2.4-3.6 3.4-1.6s1.9 1.6 2.9-1.4 1.6-1.3 2.2-1.3" {...line} />);
    default:
      return svg(<path d="M2.5 3.5h7M2.5 6h7M2.5 8.5h4.5" {...line} />);
  }
}

/** The dock button: the reticle dot. */
export const IconNodeTool = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M3.5 6.5v-3h3M11.5 3.5h3v3M14.5 11.5v3h-3M6.5 14.5h-3v-3" />
    <circle cx="9" cy="9" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);
