import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { joinThread, leaveThread } from '../studyDesk/deskStore';
import type { DeskItem } from '../studyDesk/types';
import { passageBox } from './geometry';
import { citeOf, short } from './passages';
import { setThinking } from './state';
import { threadChoices, threadLabel, type ThreadSummary } from './threads';
import { say } from './say';

/**
 * The passage bar: what the reader can do with a passage on the page. Placed under the passage and kept with it as the
 * page scrolls. Parts of the thinking desk add their rows (`children`); the threads row is its own.
 */
export function PassageBar({
  item,
  threads,
  active,
  showThreads,
  onNewThread,
  title = 'What is this passage doing?',
  children,
}: {
  item: DeskItem;
  threads: ThreadSummary[];
  active: string | null;
  showThreads: boolean;
  onNewThread(): void;
  title?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    document.addEventListener('scroll', bump, true);
    window.addEventListener('resize', bump);
    return () => {
      document.removeEventListener('scroll', bump, true);
      window.removeEventListener('resize', bump);
    };
  }, []);
  useLayoutEffect(() => {
    const box = passageBox(item);
    const el = ref.current;
    if (!box || !el) return setPos(null);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, (box.left + box.right) / 2 - w / 2), window.innerWidth - w - 8);
    const below = box.bottom + 10;
    const top = below + h < window.innerHeight - 8 ? below : Math.max(8, box.top - h - 10);
    setPos({ left, top });
  }, [item, tick, children]);

  // Esc closes the bar (before the reader's own Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.stopPropagation();
      setThinking({ selected: null });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const choices = threadChoices(threads, active, item);
  return (
    <div
      ref={ref}
      className="th-bar-passage"
      role="dialog"
      aria-label="Passage"
      style={pos ?? { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="th-bar-passage__head">
        <span className="th-eyebrow">{title}</span>
        <span className="th-cite" dir="auto">
          {citeOf(item)}
        </span>
        <button type="button" className="th-x" aria-label="Close" title="Close (Esc)" onClick={() => setThinking({ selected: null })}>
          ×
        </button>
      </div>
      <p className={'th-excerpt' + (item.ar ? ' th-ar' : '')} dir="auto">
        {short(item.text, 120)}
      </p>
      {children}
      {showThreads && (
        <div className="th-row" aria-label="Threads">
          {choices.map((s) => {
            const inIt = !!item.threads?.includes(s.desk.id);
            return (
              <button
                key={s.desk.id}
                type="button"
                className={'th-chip' + (inIt ? ' th-chip--on' : '')}
                aria-pressed={inIt}
                title={inIt ? 'In this thread: take it out' : 'Add to this thread'}
                onClick={() =>
                  void (inIt
                    ? leaveThread(item.id, s.desk.id).then(() => say('Taken out of the thread'))
                    : joinThread([item.id], s.desk.id).then(() => say(`Added to ${threadLabel(s.desk)}`)))
                }
              >
                <span aria-hidden="true">{inIt ? '✓' : '+'}</span>
                <bdi className={s.desk.titleAr ? 'th-ar' : undefined}>{s.desk.titleAr || s.desk.title}</bdi>
              </button>
            );
          })}
          <button type="button" className="th-chip th-chip--ghost" onClick={onNewThread} title="Choose or start a thread (Alt+T)">
            {choices.length ? 'Threads…' : 'Start a thread…'}
          </button>
        </div>
      )}
    </div>
  );
}
