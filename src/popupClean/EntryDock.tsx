import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface DockItem {
  /** Index of the entry in the lookup result (matches the entry's data-entry-index). */
  index: number;
  headword: string;
  gist: string;
}

type Side = 'left' | 'right' | null;

/** Width of an open dock tab at popup size 100%, plus a little air. */
const DOCK_WIDTH_PX = 106;
const FLASH_MS = 900;

function scrollParent(el: HTMLElement): HTMLElement | null {
  return el.closest<HTMLElement>('.dict-popup__scroll, .dict-popup__split-col');
}

/**
 * A dock of labelled tabs on the popup's edge, one per Al-Wasit entry (so one per
 * root the word led to). Pressing a tab scrolls that entry into view; the tab for
 * the entry being read stays lit. It fades in once the Al-Wasit entries reach the
 * upper part of the popup, and sits on whichever side of the popup has room.
 */
export function EntryDock({ items, popupRef, scale }: { items: DockItem[]; popupRef: RefObject<HTMLDivElement | null>; scale: number }) {
  const [side, setSide] = useState<Side>('left');
  const [active, setActive] = useState(items[0]?.index ?? 0);
  const [visible, setVisible] = useState(false);
  const key = items.map((i) => i.index).join(',');

  const entryEl = useCallback(
    (index: number) => popupRef.current?.querySelector<HTMLElement>(`[data-entry-index="${index}"]`) ?? null,
    [popupRef]
  );

  const update = useCallback(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const need = DOCK_WIDTH_PX * scale + 8;
    setSide(rect.left >= need ? 'left' : window.innerWidth - rect.right >= need ? 'right' : null);

    let current = items[0].index;
    let show = false;
    items.forEach((item, n) => {
      const el = entryEl(item.index);
      const box = el && scrollParent(el);
      if (!el || !box) return;
      const boxRect = box.getBoundingClientRect();
      const top = el.getBoundingClientRect().top - boxRect.top;
      if (n === 0 && (top < box.clientHeight * 0.6 || box.classList.contains('dict-popup__split-col'))) show = true;
      if (top <= box.clientHeight * 0.3) current = item.index;
      if (n === items.length - 1 && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) current = item.index;
    });
    setVisible(show);
    setActive(current);
  }, [items, popupRef, scale, entryEl]);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const frame = requestAnimationFrame(update);
    popup.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      popup.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
    // `key` re-runs this when the set of entries changes.
  }, [update, popupRef, key]);

  function go(index: number) {
    const el = entryEl(index);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.classList.add('dict-popup__entry--flash');
    window.setTimeout(() => el.classList.remove('dict-popup__entry--flash'), FLASH_MS);
  }

  if (!side || items.length < 2) return null;
  return (
    <nav className={'dict-popup__dock' + (visible ? ' dict-popup__dock--on' : '')} data-side={side} aria-label="Jump to an Al-Wasīṭ entry">
      {items.map((item) => (
        <button
          key={item.index}
          type="button"
          className="dict-popup__dock-tab"
          aria-current={item.index === active}
          aria-label={`Go to the Al-Wasīṭ entry ${item.headword}: ${item.gist}`}
          title={`${item.headword} · ${item.gist}`}
          tabIndex={visible ? 0 : -1}
          onClick={() => go(item.index)}
        >
          <span className="dict-popup__dock-head" lang="ar">
            {item.headword}
          </span>
          {item.gist && (
            <span className="dict-popup__dock-gist" lang="ar">
              {item.gist}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
