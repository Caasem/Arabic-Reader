import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Margins / Document in the quiet reader's dock: margins on or off (Alt+M) and the desk document (D). The dock
 * keeps an empty slot for this (`#qr-dock-extra`, src/quietReader/Chrome.tsx). In Focus the dock is hidden, so
 * the same switch sits as a small pill beside "Leave focus": the margins stay in Focus, and so does the way
 * to them.
 */

interface Where {
  slot: HTMLElement | null;
  /** The Focus pill's box, when Focus is on. */
  pill: DOMRect | null;
  /** The dock shows labels under its icons. */
  labels: boolean;
}

function look(): Where {
  const slot = document.getElementById('qr-dock-extra');
  const pill = document.querySelector('.qr--focus .qr-focus-pill');
  return { slot, pill: pill ? pill.getBoundingClientRect() : null, labels: !!document.querySelector('.qr-dock .qr-dock__btn span') };
}

const same = (a: Where, b: Where) => a.slot === b.slot && a.labels === b.labels && !!a.pill === !!b.pill && (!a.pill || (a.pill.right === b.pill!.right && a.pill.top === b.pill!.top));

const IconMargins = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M8 4v16M16 4v16" />
  </svg>
);
const IconDocument = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </svg>
);

export function DeskSwitch({ marginsOn, onToggleMargins, onDocument }: { marginsOn: boolean; onToggleMargins(): void; onDocument(): void }) {
  const [where, setWhere] = useState<Where>(look);
  // The dock comes and goes with Focus and the reader; look for it again now and then.
  useEffect(() => {
    const check = () => setWhere((w) => {
      const now = look();
      return same(w, now) ? w : now;
    });
    check();
    const t = window.setInterval(check, 500);
    window.addEventListener('resize', check);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', check);
    };
  }, []);

  if (where.pill) {
    return (
      <div className="sd-switch-pill" role="group" aria-label="Desk" style={{ left: where.pill.right + 8, top: where.pill.top }}>
        <span>Margins stay ·</span>
        <button type="button" aria-pressed={marginsOn} onClick={onToggleMargins} title="Margins on and off (Alt+M)">
          Margins
        </button>
        <button type="button" onClick={onDocument} title="The desk document (D)">
          Document
        </button>
      </div>
    );
  }
  if (!where.slot) return null;
  return createPortal(
    <>
      <span className="qr-dock__sep" aria-hidden="true" />
      <button
        type="button"
        className={'qr-dock__btn' + (marginsOn ? ' qr-dock__btn--on' : '')}
        aria-pressed={marginsOn}
        aria-label="Margins"
        title="Margins on and off (Alt+M)"
        onClick={onToggleMargins}
      >
        <IconMargins />
        {where.labels && <span>Margins</span>}
      </button>
      <button type="button" className="qr-dock__btn" aria-label="Document" title="The desk document (D)" onClick={onDocument}>
        <IconDocument />
        {where.labels && <span>Document</span>}
      </button>
    </>,
    where.slot
  );
}
