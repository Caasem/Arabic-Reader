import type { ReactNode } from 'react';
import { closeScreen } from '../state';

/** A thinking desk screen over the app: Back, an eyebrow and a title, then the screen's own body. */
export function Frame({ eyebrow, title, aside, children, wide }: { eyebrow: string; title: ReactNode; aside?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="th-screen" role="dialog" aria-label={eyebrow}>
      <div className={'th-screen__wrap' + (wide ? ' th-screen__wrap--wide' : '')}>
        <div className="th-screen__top">
          <button type="button" className="sd-pill" onClick={closeScreen}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          {aside}
        </div>
        <span className="th-eyebrow">{eyebrow}</span>
        <h1 className="th-screen__title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Tabs under a screen's head. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange(id: T): void }) {
  return (
    <div className="th-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
