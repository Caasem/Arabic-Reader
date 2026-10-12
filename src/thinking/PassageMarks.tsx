import { useEffect, useLayoutEffect, useState } from 'react';
import type { PdfPageContext } from '../pdf/pages/extensions';
import { parsePdfLocation } from '../studyDesk/pageGeometry';
import type { DeskItem } from '../studyDesk/types';
import { cleanRects } from './geometry';
import { moveInfo } from './moves';
import { useMarks } from './marksStore';
import { setThinking, useThinking } from './state';

/**
 * The passages on the page, marked so they can be picked: a small handle at the start of each one. A click on a word
 * still opens the dictionary; the handle opens the passage bar. On PDF pages the marks are a pages-view extension
 * layer inside each page; in the quiet reader they sit over the text (which is never changed: its offsets are the
 * `clean:` places).
 */

function Handle({ item, style, selected, moves }: { item: DeskItem; style: React.CSSProperties; selected: boolean; moves: boolean }) {
  const move = moves && item.move ? moveInfo(item.move) : null;
  return (
    <button
      type="button"
      className={'th-handle' + (selected ? ' th-handle--sel' : '') + (move ? ' th-handle--move' : '')}
      data-m={move?.id}
      style={style}
      title={move ? `${move.en}: what is this passage doing?` : 'What is this passage doing?'}
      aria-label="Open the passage bar"
      aria-pressed={selected}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setThinking({ selected: selected ? null : item.id, touch: null });
      }}
    >
      {move ? <span className="th-handle__ar">{move.ar}</span> : <span className="th-handle__dot" aria-hidden="true" />}
    </button>
  );
}

/** A dark count beside a passage that other things touch; it shows them in the Ḥāshiya strip. */
function Badge({ item, n, style }: { item: DeskItem; n: number; style: React.CSSProperties }) {
  return (
    <button
      type="button"
      className="th-badge"
      style={style}
      title={n === 1 ? '1 thing touches this passage' : `${n} things touch this passage`}
      aria-label={`${n} touching this passage`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setThinking({ touch: item.id, selected: null });
      }}
    >
      {n}
    </button>
  );
}

/** Drawn in each PDF page (registered by the reader host). */
export function PdfPassageLayer({ book, page, width, height }: PdfPageContext) {
  const { passages, moves, counts } = useMarks();
  const { selected } = useThinking();
  const here = passages.flatMap((item) => {
    const at = item.source?.bookId === book.id ? parsePdfLocation(item.source.location) : null;
    return at && at.page === page ? [{ item, at }] : [];
  });
  if (!here.length) return null;
  return (
    <div className="th-pdfmarks">
      {here.map(({ item, at }) => (
        <div key={item.id}>
          {moves && item.move && <div className="th-underline" data-m={item.move} style={{ left: at.x * width, top: (at.y + at.h) * height - 2, width: at.w * width }} />}
          <Handle item={item} moves={moves} selected={selected === item.id} style={{ left: (at.x + at.w) * width, top: at.y * height }} />
          {counts.has(item.id) && <Badge item={item} n={counts.get(item.id)!} style={{ left: at.x * width, top: (at.y + at.h) * height }} />}
        </div>
      ))}
    </div>
  );
}

/** Over the quiet reader's text: the passages of this book whose chapter is showing. */
export function QuietPassageLayer({ bookId }: { bookId: string }) {
  const { passages, moves, counts } = useMarks();
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
  const [placed, setPlaced] = useState<{ item: DeskItem; x: number; y: number; lines: DOMRect[] }[]>([]);
  useLayoutEffect(() => {
    const out: { item: DeskItem; x: number; y: number; lines: DOMRect[] }[] = [];
    for (const item of passages) {
      if (item.source?.bookId !== bookId || !item.source.location?.startsWith('clean:')) continue;
      const rects = cleanRects(item.source.location);
      const first = rects[0];
      if (!first || first.bottom < 0 || first.top > window.innerHeight) continue;
      // The passage's start: the right end of its first line in Arabic, the left end in a Latin passage.
      out.push({ item, x: item.ar ? first.right : first.left, y: first.top, lines: rects });
    }
    setPlaced(out);
  }, [passages, bookId, tick]);
  return (
    <div className="th-qrmarks">
      {placed.map(({ item, x, y, lines }) => (
        <div key={item.id}>
          {moves && item.move && lines.map((r, i) => <div key={i} className="th-underline" data-m={item.move} style={{ left: r.left, top: r.bottom - 2, width: r.width }} />)}
          <Handle item={item} moves={moves} selected={selected === item.id} style={{ left: x, top: y }} />
          {counts.has(item.id) && (
            // The passage's end: the left end of its last line in Arabic, the right end in a Latin passage.
            <Badge item={item} n={counts.get(item.id)!} style={{ left: item.ar ? lines[lines.length - 1].left : lines[lines.length - 1].right, top: lines[lines.length - 1].bottom }} />
          )}
        </div>
      ))}
    </div>
  );
}
