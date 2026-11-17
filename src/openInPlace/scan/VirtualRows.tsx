import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const OVERSCAN = 6;

/**
 * A long list of equal-height rows that draws only the ones in view (a scan can find thousands of books). The
 * container takes the height its parent gives it and scrolls; `render` draws row `i`.
 */
export function VirtualRows({ count, rowHeight, render, label }: { count: number; rowHeight: number; render(index: number): ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN);
  const last = Math.min(count, Math.ceil((view.top + view.height) / rowHeight) + OVERSCAN);
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    rows.push(
      <div key={i} className="oip-vrow" role="row" style={{ position: 'absolute', top: i * rowHeight, height: rowHeight, left: 0, right: 0 }}>
        {render(i)}
      </div>
    );
  }

  return (
    <div ref={box} className="oip-vlist" role="rowgroup" aria-label={label} onScroll={(e) => setView((v) => ({ ...v, top: e.currentTarget.scrollTop }))}>
      <div style={{ position: 'relative', height: count * rowHeight }}>{rows}</div>
    </div>
  );
}
