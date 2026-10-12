import { useMemo, useState } from 'react';
import { Shell } from '../dictionarySearch/Shell';
import '../dictionarySearch/dictionarySearch.css';
import { createThread, joinThread } from '../studyDesk/deskStore';
import { looksArabic } from '../studyDesk/useDesk';
import type { ReaderPreferences } from '../types';
import { ago } from './passages';
import { openScreen, setThinking } from './state';
import { filterThreads, namesFromTyped, threadLabel, type ThreadSummary } from './threads';
import { say } from './say';

/**
 * Alt+T: the threads, in the Alt+D palette's frame and style. Type to filter or to start a thread; Enter collects into
 * the chosen one; Stop collecting turns the active thread off. With `forItem`, the chosen thread also takes that passage.
 */
export function ThreadPicker({
  threads,
  active,
  style,
  forItem,
  onClose,
}: {
  threads: ThreadSummary[];
  active: string | null;
  style: ReaderPreferences['dictionarySearchStyle'];
  forItem?: string;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => filterThreads(threads, query), [threads, query]);
  const typed = query.trim();
  const exact = threads.some((s) => s.desk.title === typed || s.desk.titleAr === typed);
  // Rows: "Start a thread" (when something new is typed), each thread, "Stop collecting" (when one is on).
  const rows: ('new' | 'stop' | string)[] = [...(typed && !exact ? ['new'] : []), ...list.map((s) => s.desk.id), ...(active ? ['stop'] : [])];
  const [cursor, setCursor] = useState(0);
  const at = Math.min(cursor, Math.max(0, rows.length - 1));

  async function choose(row: string) {
    if (row === 'stop') {
      setThinking({ active: null });
      say('Stopped collecting');
    } else if (row === 'new') {
      const t = await createThread(namesFromTyped(typed, looksArabic(typed)));
      setThinking({ active: t.id });
      if (forItem) await joinThread([forItem], t.id);
      say(`Collecting into ${threadLabel(t)}`);
    } else {
      const s = threads.find((x) => x.desk.id === row);
      if (!s) return;
      setThinking({ active: row });
      if (forItem) await joinThread([forItem], row);
      say(`Collecting into ${threadLabel(s.desk)}`);
    }
    onClose();
  }

  return (
    <Shell style={style} onClose={onClose} title="Threads" keyHint="Alt T" label="Threads" posKey="thinking.threadsPos">
      <div className="sd-inbox th-picker">
        <div className="dsearch__input-row">
          <input
            className="dsearch__input sd-inbox__input"
            dir="auto"
            autoFocus
            value={query}
            placeholder="Filter, or name a new thread"
            aria-label="Filter the threads, or name a new one"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(0, Math.min(rows.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1))));
              } else if (e.key === 'Enter' && rows[at]) {
                e.preventDefault();
                void choose(rows[at]);
              }
            }}
          />
        </div>
        <div className="dsearch__results" role="listbox" aria-label="Threads">
          {!threads.length && !typed && <p className="dsearch__hint">No threads yet. Name one above (a question, a topic) and press Enter.</p>}
          {rows.map((row, i) => {
            const on = i === at;
            const cls = 'dsearch__entry' + (on ? ' dsearch__entry--active' : '');
            if (row === 'new')
              return (
                <div key="new" role="option" aria-selected={on} className={cls} onClick={() => void choose('new')}>
                  <div className="sd-inbox__new">
                    <span className="dsearch__provider">Start a thread</span>
                    <b dir="auto">{typed}</b>
                    <span className="dsearch__meta sd-inbox__enter">Enter</span>
                  </div>
                </div>
              );
            if (row === 'stop')
              return (
                <div key="stop" role="option" aria-selected={on} className={cls} onClick={() => void choose('stop')}>
                  <div className="dsearch__entry-head">
                    <span className="dsearch__headword sd-latin">Stop collecting</span>
                    <span className="dsearch__meta">New things stay where they are made</span>
                  </div>
                </div>
              );
            const s = threads.find((x) => x.desk.id === row)!;
            return (
              <div key={row} role="option" aria-selected={on} className={cls} onClick={() => void choose(row)}>
                <div className="dsearch__entry-head">
                  <span className={'dsearch__headword' + (s.desk.titleAr ? '' : ' sd-latin')} dir="auto">
                    {s.desk.titleAr || s.desk.title}
                  </span>
                  <span className="dsearch__meta">
                    <bdi>{s.desk.titleAr && s.desk.title !== s.desk.titleAr ? s.desk.title + ' · ' : ''}</bdi>
                    {s.count === 1 ? '1 item' : `${s.count} items`} · last added {ago(s.lastAdded)}
                  </span>
                  <span className="dsearch__provider">{s.desk.id === active ? 'Collecting' : 'Thread'}</span>
                </div>
                {on && (
                  <div className="sd-acts">
                    <button type="button" className="dsearch__add" onClick={(e) => (e.stopPropagation(), void choose(row))}>
                      Collect into it
                    </button>
                    <button
                      type="button"
                      className="sd-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                        openScreen({ kind: 'thread', id: row });
                      }}
                    >
                      Open
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
