import { openScreen, setThinking } from './state';
import type { ThreadSummary } from './threads';
import { say } from './say';

/** Under the reader's header while a thread is active: what new things join, and the way to stop. */
export function ThreadBar({ thread }: { thread: ThreadSummary }) {
  const d = thread.desk;
  return (
    <div className="th-collect" role="region" aria-label="Active thread">
      <span className="th-kind">Collecting into</span>
      <b className={d.titleAr ? 'th-ar th-collect__name' : 'th-collect__name'} dir="auto">
        {d.titleAr || d.title}
      </b>
      <span className="th-collect__text">
        {d.titleAr && d.title !== d.titleAr && <bdi>{d.title} · </bdi>}
        {thread.count} gathered · new thoughts, moves and masāʾil join it
      </span>
      <button type="button" className="sd-btn" onClick={() => openScreen({ kind: 'thread', id: d.id })}>
        Open thread
      </button>
      <button
        type="button"
        className="sd-btn th-btn--ghost"
        onClick={() => {
          setThinking({ active: null });
          say('Stopped collecting');
        }}
      >
        Stop <kbd>Alt T</kbd>
      </button>
    </div>
  );
}
