import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeskItem } from './types';
import { itemTitle, TYPE_LABEL } from './useDesk';

interface Props {
  /** This desk's items: the ones off the page first, then the ones already in the text (picking those moves them). */
  items: DeskItem[];
  onPage: Set<string>;
  /** Where to show it: below the line the "/" was typed on. */
  anchor: DOMRect;
  onPick(item: DeskItem): void;
  onPullIn?(): void;
  onCancel(): void;
}

/** "/" on an empty line of the desk document: choose an item to put there. */
export function ItemPicker({ items, onPage, anchor, onPick, onPullIn, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (i: DeskItem) => !q || `${i.text} ${i.body ?? ''}`.toLowerCase().includes(q);
    const off = items.filter((i) => !onPage.has(i.id) && match(i));
    const on = items.filter((i) => onPage.has(i.id) && match(i));
    return [...off, ...on];
  }, [items, onPage, query]);
  const active = Math.min(at, Math.max(0, list.length - 1));

  function onKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt(Math.min(active + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (list[active]) onPick(list[active]);
    }
  }

  const top = Math.min(anchor.bottom + 6, window.innerHeight - 330);
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - 392);
  return (
    <div className="sd-picker" role="dialog" aria-label="Put an item here" style={{ top, left }} onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        className="sd-picker__input"
        dir="auto"
        value={query}
        placeholder="Find an item to put here"
        aria-label="Find an item to put here"
        onChange={(e) => (setQuery(e.target.value), setAt(0))}
        onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget as Node) && onCancel()}
      />
      <div className="sd-picker__list" role="listbox" aria-label="Items">
        {list.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === active}
            className={'sd-picker__row' + (i === active ? ' sd-picker__row--on' : '')}
            onMouseEnter={() => setAt(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(item)}
          >
            <span className={item.ar ? 'sd-picker__t sd-picker__t--ar' : 'sd-picker__t'} dir="auto">
              {itemTitle(item)}
            </span>
            <span className="sd-picker__k">{onPage.has(item.id) ? 'Move here' : TYPE_LABEL[item.type]}</span>
          </button>
        ))}
        {!list.length && <p className="sd-picker__empty">{query.trim() ? 'Nothing on this desk matches.' : 'Nothing on this desk yet.'}</p>}
      </div>
      {onPullIn && (
        <button type="button" className="sd-picker__more" onMouseDown={(e) => e.preventDefault()} onClick={onPullIn}>
          Pull in from other books… <kbd>Alt U</kbd>
        </button>
      )}
    </div>
  );
}
