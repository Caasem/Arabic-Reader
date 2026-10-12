import { useEffect, useLayoutEffect, useState } from 'react';
import type { PdfPageContext } from '../pdf/pages/extensions';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';
import { cleanRects } from './geometry';
import { useMarks } from './marksStore';
import { setThinking, useThinking } from './state';

/**
 * The passages on the page, marked so they can be picked: a small handle at the start of each one. A click on a word
 * still opens the dictionary; the handle opens the passage bar. On PDF pages the marks are a pages-view extension
 * layer inside each page; in the quiet reader they sit over the text (which is never changed: its offsets are the
 * `clean:` places).
 */

function Handle({ item, style, selected }: { item: DeskItem; style: React.CSSProperties; selected: boolean }) {
  return (
    <button
      type="button"
      className={'th-handle' + (selected ? ' th-handle--sel' : '')}
      style={style}
      title="What is this passage doing?"
      aria-label="Open the passage bar"
      aria-pressed={selected}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setThinking({ selected: selected ? null : item.id, touch: null });
      }}
    >
      <span className="th-handle__dot" aria-hidden="true" />
    </button>
  );
}

/** Drawn in each PDF page (registered by the reader host). */
export function PdfPassageLayer({ book, page, width, height }: PdfPageContext) {
  const { passages } = useMarks();
  const { selected } = useThinking();
  const here = passages.flatMap((item) => {
    const at = item.source?.bookId === book.id ? parsePdfLocation(item.source.location) : null;
    return at && at.page === page ? [{ item, at }] : [];
  });
  if (!here.length) return null;
  return (
    <div className="th-pdfmarks">
      {here.map(({ item, at }) => (
        <Handle key={item.id} item={item} selected={selected === item.id} style={{ left: (at.x + at.w) * width, top: at.y * height }} />
      ))}
    </div>
  );
}

/** Over the quiet reader's text: the passages of this book whose chapter is showing. */
export function QuietPassageLayer({ bookId }: { bookId: string }) {
  const { passages } = useMarks();
  const { selected } = useThinking();
  const [tick, setTick] = useState(0);
  // Follow the text as it scrolls and reflows.
  useEffect(() => {
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    document.addEventListener('scroll', bump, true);
    window.addEventListener('resize', bump);
    const poll = window.setInterval(bump, 1200);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('scroll', bump, true);
      window.removeEventListener('resize', bump);
      window.clearInterval(poll);
    };
  }, []);
  const [placed, setPlaced] = useState<{ item: DeskItem; x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    const out: { item: DeskItem; x: number; y: number }[] = [];
    for (const item of passages) {
      if (item.source?.bookId !== bookId || !item.source.location?.startsWith('clean:')) continue;
      const rects = cleanRects(item.source.location);
      const first = rects[0];
      if (!first || first.bottom < 0 || first.top > window.innerHeight) continue;
      // The passage's start: the right end of its first line in Arabic, the left end in a Latin passage.
      out.push({ item, x: item.ar ? first.right : first.left, y: first.top });
    }
    setPlaced(out);
  }, [passages, bookId, tick]);
  return (
    <div className="th-qrmarks">
      {placed.map(({ item, x, y }) => (
        <Handle key={item.id} item={item} selected={selected === item.id} style={{ left: x, top: y }} />
      ))}
    </div>
  );
}
