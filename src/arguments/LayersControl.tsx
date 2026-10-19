import { useState } from 'react';
import type { ReaderPreferences } from '../types';
import type { Layers } from './layers';

interface Props {
  layers: Layers;
  onChange(patch: Partial<ReaderPreferences>): void;
  /** In the sheet's header: the popover opens downward. */
  compact?: boolean;
}

/** The argument layer's layers, each usable alone: marks on the page, cards in the margin, the sheet, and which reader notes show. */
export function LayersControl({ layers, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const check = (label: string, checked: boolean, key: keyof ReaderPreferences) => (
    <label className="arg-layers__row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <span className={`arg-layers${compact ? ' arg-layers--compact' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Layers
      </button>
      {open && (
        <div className="arg-layers__pop" role="group" aria-label="Layers">
          {check('Page marks', layers.marks, 'argumentsMarks')}
          {check('Margin cards', layers.cards, 'argumentsCards')}
          <div className="arg-layers__row">
            Sheet
            <span className="arg-layers__seg" role="radiogroup" aria-label="Sheet">
              {(['off', 'side', 'full'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={layers.sheet === s} onClick={() => onChange({ argumentsSheet: s })}>
                  {s === 'off' ? 'Off' : s === 'side' ? 'Side' : 'Full'}
                </button>
              ))}
            </span>
          </div>
          <div className="arg-layers__sub">Reader notes in the margin</div>
          {check('Warrants', layers.warrants, 'argumentsWarrants')}
          {check('Backings', layers.backings, 'argumentsBackings')}
          {check('Exceptions', layers.exceptions, 'argumentsExceptions')}
        </div>
      )}
    </span>
  );
}
