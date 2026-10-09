import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PILE_COLOURS } from './piles';
import type { DeskItem } from './types';

interface Props {
  pileId: string;
  group: DeskItem[];
  /** The margin it opens in: never wider, so it never covers the text column. */
  left: number;
  width: number;
  /** Kept open (a click or Space); otherwise it closes when the pointer leaves. */
  pinned: boolean;
  naming: boolean;
  /** One card of the pile, laid out in the fan (MarginLayer renders it, so it is the same card as in the margin). */
  renderCard(item: DeskItem, index: number): ReactNode;
  onEnter(): void;
  onLeave(): void;
  onClose(): void;
  onStartNaming(): void;
  onName(name: string, color: string | undefined): void;
  onCancelNaming(): void;
}

/**
 * A pile spread out in its margin (hover, or kept open with a click or Space; Esc closes). Its cards can be
 * edited here, deleted, or dragged out to leave the pile; the grip moves the whole pile. Placed by MarginLayer's
 * layout pass, which keeps it on screen.
 */
export function PileFan({ pileId, group, left, width, pinned, naming, renderCard, onEnter, onLeave, onClose, onStartNaming, onName, onCancelNaming }: Props) {
  const top = group[0].pile;
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpening(false));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className={'sd-fan' + (pinned ? ' sd-fan--pinned' : '') + (opening ? ' sd-fan--opening' : '')}
      data-fan={pileId}
      role="dialog"
      aria-label={`Pile${top?.name ? ` ${top.name}` : ''}, ${group.length} cards`}
      style={{ left, width, ...(top?.color ? ({ '--tab': top.color } as React.CSSProperties) : {}) }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('textarea, input, button, .sd-gloss')) return;
        onStartNaming();
      }}
    >
      <div className="sd-fan__head" onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && (e.stopPropagation(), onStartNaming())}>
        <span className="sd-fan__grip" title="Drag to move the pile" aria-hidden="true">
          ⠿
        </span>
        <span className="sd-fan__dot" aria-hidden="true" />
        <span className={'sd-fan__name' + (top?.name ? '' : ' sd-fan__name--empty')} title="Double-click to name the pile">
          {top?.name || 'Unnamed pile · double-click to name'}
        </span>
        <span className="sd-fan__count">{group.length}</span>
        <button type="button" className="sd-fan__close" aria-label="Close the pile" onClick={onClose}>
          ×
        </button>
      </div>
      {naming && <Namer name={top?.name ?? ''} color={top?.color} onSave={onName} onCancel={onCancelNaming} />}
      <div className="sd-fan__list">{group.map((m, i) => renderCard(m, i))}</div>
      <div className="sd-fan__foot">{pinned ? 'Kept open · Esc closes' : 'Click or Space keeps it open'} · drag a card out to take it off</div>
    </div>
  );
}

function Namer({ name, color, onSave, onCancel }: { name: string; color?: string; onSave(name: string, color: string | undefined): void; onCancel(): void }) {
  const [value, setValue] = useState(name);
  const [tab, setTab] = useState(color);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="sd-fan__namer">
      <input
        ref={input}
        dir="auto"
        maxLength={40}
        value={value}
        placeholder="Name this pile"
        aria-label="Pile name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave(value, tab);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="sd-fan__swatches" role="group" aria-label="Colour tab">
        <button type="button" className="sd-fan__swatch sd-fan__swatch--none" aria-label="No colour" aria-pressed={!tab} onClick={() => (setTab(undefined), input.current?.focus())} />
        {PILE_COLOURS.map((c) => (
          <button
            key={c.value}
            type="button"
            className="sd-fan__swatch"
            style={{ background: c.value }}
            aria-label={c.name}
            aria-pressed={tab === c.value}
            onClick={() => (setTab(c.value), input.current?.focus())}
          />
        ))}
        <span className="sd-fan__keys">Enter saves · Esc cancels</span>
        <button type="button" className="sd-fan__save" onClick={() => onSave(value, tab)}>
          Save
        </button>
      </div>
    </div>
  );
}
