import { useMemo, useState } from 'react';
import { AnkiConnectError } from '../../anki/ankiConnect';
import { usePreferences } from '../../state/PreferencesContext';
import { patchItems, updateItem } from '../../studyDesk/deskStore';
import type { DeskItem } from '../../studyDesk/types';
import { sendThoughts } from '../ankiThoughts';
import { goToItem, type OpenBook } from '../nav';
import { ago, citeOf, dateLabel, isThought, short, thoughtText } from '../passages';
import { agree, drop, droppedThoughts, dueThoughts, firstReview, history, intervalLabel, nextDue, passageFor, restore, revise } from '../revisit';
import { say } from '../say';
import type { Screen } from '../state';
import { ThoughtLinks } from '../ThoughtLinks';
import { useThinkingData } from '../useThinkingData';
import { Frame, Tabs } from './Frame';
import { ItemLine } from './parts';

const DAY = 864e5;

/**
 * Revisit: thoughts come back after a while to be judged again. Still agree, Revise (the old wording is kept) or Drop
 * (archived, with Undo). Beside the thought: today's queue, how it changed, and sending the scheduled ones to Anki.
 * Dropped thoughts are listed under Dropped, each with Restore.
 */
export function RevisitScreen({ screen, onOpenBook }: { screen: Extract<Screen, { kind: 'revisit' }>; onOpenBook?: OpenBook }) {
  const data = useThinkingData();
  const [now] = useState(() => Date.now());
  // The thought on show: one picked from the queue or opened by id (even if not due), else the one waiting longest.
  const [focus, setFocus] = useState<string | null>(screen.id ?? null);
  const [view, setView] = useState<'today' | 'dropped'>('today');
  const queue = useMemo(() => dueThoughts(data.items, now), [data.items, now]);
  const dropped = useMemo(() => droppedThoughts(data.items), [data.items]);
  const picked = focus ? data.byId.get(focus) : undefined;
  const current = picked && isThought(picked) ? picked : queue[0];

  if (!data.loaded) return <div className="th-screen th-screen--loading" role="status">Loading…</div>;

  const title =
    view === 'dropped'
      ? 'Dropped thoughts'
      : queue.length
        ? `${queue.length} ${queue.length === 1 ? 'thought' : 'thoughts'} to look at again`
        : current
          ? 'Looking at it again'
          : 'Done for today';
  const soon = nextDue(data.items, now);
  return (
    <Frame eyebrow="Revisit" wide title={title}>
      {(dropped.length > 0 || view === 'dropped') && (
        <Tabs<'today' | 'dropped'>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'today', label: 'Today' },
            { id: 'dropped', label: `Dropped · ${dropped.length}` },
          ]}
        />
      )}
      {view === 'dropped' ? (
        <Dropped items={dropped} now={now} onOpenBook={onOpenBook} />
      ) : (
        <div className="th-rv">
          <div className="th-rv__main">
            {current ? (
              <Thought key={current.id} item={current} items={data.items} byId={data.byId} now={now} onFocus={setFocus} onOpenBook={onOpenBook} />
            ) : (
              <section className="th-panel th-rv__done">
                <h2 className="th-h2">All caught up</h2>
                <p className="th-sub">
                  {soon ? `The next thought comes back ${comesBack(soon, now)} (${dateLabel(soon)}).` : 'Nothing is scheduled. A thought you write is brought back a week later.'}
                </p>
              </section>
            )}
          </div>
          <aside className="th-rv__side">
            <section className="th-panel">
              <h2 className="th-h2">Today’s queue</h2>
              {!queue.length && <p className="th-sub">Nothing is waiting.</p>}
              <div className="th-rv__queue">
                {queue.map((q) => (
                  <button key={q.id} type="button" className="th-rv__q" aria-current={q.id === current?.id} onClick={() => setFocus(q.id)}>
                    <span dir="auto">{short(thoughtText(q), 80)}</span>
                    <small>
                      {citeOf(q) && <bdi>{citeOf(q)} · </bdi>}
                      due {ago(q.review?.due ?? now, now)}
                    </small>
                  </button>
                ))}
              </div>
            </section>
            {current && <Changed item={current} />}
            <AnkiPanel items={data.items} />
          </aside>
        </div>
      )}
    </Frame>
  );
}

/** Thoughts dropped in Revisit, newest drop first. Restore puts one back among the live ones, due a week out. */
function Dropped({ items, now, onOpenBook }: { items: DeskItem[]; now: number; onOpenBook?: OpenBook }) {
  if (!items.length) return <p className="th-empty">No dropped thoughts. A thought you drop in Revisit waits here.</p>;
  const onRestore = (item: DeskItem) => {
    const before = { droppedAt: item.droppedAt, review: item.review };
    void patchItems([{ id: item.id, patch: restore(Date.now()) }]);
    say(`Restored “${short(thoughtText(item), 40)}”. It comes back in a week.`, () => patchItems([{ id: item.id, patch: before }]));
  };
  return (
    <div className="th-list">
      {items.map((item) => (
        <ItemLine
          key={item.id}
          item={item}
          dim
          sub={` · dropped ${ago(item.droppedAt ?? now, now)}`}
          acts={
            <>
              {(item.source?.location || item.pin) && (
                <button type="button" className="th-link" onClick={() => void goToItem(item, onOpenBook)}>
                  Open page ↗
                </button>
              )}
              <button type="button" className="sd-btn" onClick={() => onRestore(item)}>
                Restore
              </button>
            </>
          }
        />
      ))}
    </div>
  );
}

const comesBack = (due: number, now: number): string => (due - now < DAY ? 'later today' : `in ${intervalLabel(Math.round((due - now) / DAY))}`);

function Thought({
  item,
  items,
  byId,
  now,
  onFocus,
  onOpenBook,
}: {
  item: DeskItem;
  items: DeskItem[];
  byId: Map<string, DeskItem>;
  now: number;
  onFocus(id: string | null): void;
  onOpenBook?: OpenBook;
}) {
  const review = item.review ?? firstReview(item.createdAt);
  const passage = useMemo(() => passageFor(item, items), [item, items]);
  const [revising, setRevising] = useState(false);
  const [text, setText] = useState(thoughtText(item));
  const versions = item.versions?.length ?? 0;
  const linked = (item.links ?? []).map((id) => byId.get(id)).filter((i): i is DeskItem => !!i && !i.droppedAt);
  const seen = review.agreed.length;
  const where = passage ?? item;

  const onAgree = () => {
    void updateItem(item.id, { review: agree(review, Date.now()) });
    onFocus(null);
    say('Kept. It will come back later.');
  };
  const onDrop = () => {
    void updateItem(item.id, drop(Date.now()));
    onFocus(null);
    say(`Dropped “${short(thoughtText(item), 40)}”`, () => patchItems([{ id: item.id, patch: { droppedAt: undefined } }]));
  };
  const onSave = () => {
    const next = text.trim();
    if (!next || next === thoughtText(item)) return;
    void updateItem(item.id, revise(item, next, Date.now()));
    onFocus(null);
    say(`Saved as version ${versions + 2}`);
  };

  return (
    <section className="th-panel th-rv__card">
      <span className="th-eyebrow">Your thought</span>
      {passage && (
        <div className="th-rv__passage">
          <p className={'th-excerpt' + (passage.ar ? ' th-ar' : '')} dir="auto">
            {short(passage.text, 320)}
          </p>
          <p className="th-line__meta">{citeOf(passage) && <bdi>{citeOf(passage)}</bdi>}</p>
        </div>
      )}
      <div className="th-rv__meta">
        {(passage || item.source?.location || item.pin) && (
          <button type="button" className="th-link" onClick={() => void goToItem(where, onOpenBook)}>
            Open page ↗
          </button>
        )}
        <span className="th-faint">first written {dateLabel(item.createdAt)}</span>
      </div>
      {revising ? (
        <div className="th-rv__revise">
          <textarea className="th-input th-rv__text" dir="auto" rows={4} value={text} aria-label="Your thought, new wording" autoFocus onChange={(e) => setText(e.target.value)} />
          <p className="th-sub">The current wording is kept as version {versions + 1}.</p>
          <div className="th-row">
            <button type="button" className="sd-btn sd-btn--pri" disabled={!text.trim() || text.trim() === thoughtText(item)} onClick={onSave}>
              Save as v{versions + 2}
            </button>
            <button type="button" className="sd-btn" onClick={() => (setRevising(false), setText(thoughtText(item)))}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={'th-rv__words' + (item.ar ? ' th-ar' : '')} dir="auto">
            {thoughtText(item)}
          </p>
          <p className="th-rv__ask">
            Reading it again{seen ? ` (you agreed ${seen}× before)` : ''}, do you still hold it?
          </p>
          <div className="th-rv__answers">
            <div className="th-rv__answer">
              <button type="button" className="sd-btn sd-btn--pri" onClick={onAgree}>
                Still agree
              </button>
              <small>next in about {intervalLabel(agree(review, now).every)}</small>
            </div>
            <div className="th-rv__answer">
              <button type="button" className="sd-btn" onClick={() => setRevising(true)}>
                Revise
              </button>
              <small>keeps this wording</small>
            </div>
            <div className="th-rv__answer">
              <button type="button" className="sd-btn" onClick={onDrop}>
                Drop
              </button>
              <small>archives it</small>
            </div>
          </div>
        </>
      )}
      <div className="th-rv__links">
        {!!linked.length && (
          <>
            <h3 className="th-group__h">Linked thoughts</h3>
            <div className="th-list">
              {linked.map((l) => (
                <ItemLine
                  key={l.id}
                  item={l}
                  acts={
                    isThought(l) ? (
                      <button type="button" className="th-link" onClick={() => onFocus(l.id)}>
                        Look at it
                      </button>
                    ) : (
                      l.source?.location && (
                        <button type="button" className="th-link" onClick={() => void goToItem(l, onOpenBook)}>
                          Open page ↗
                        </button>
                      )
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
        <ThoughtLinks thought={item} items={items} />
      </div>
    </section>
  );
}

/** "How this thought changed": the wordings, newest first, with the days it was still agreed. */
function Changed({ item }: { item: DeskItem }) {
  const wordings = history(item);
  const rows = [
    ...wordings.map((w, i) => ({ at: w.at, text: w.text, label: `Version ${wordings.length - i}${w.current ? ' · now' : ''}`, current: w.current })),
    ...(item.review?.agreed ?? []).map((at) => ({ at, text: '', label: 'Still agreed', current: false })),
  ].sort((a, b) => b.at - a.at);
  return (
    <section className="th-panel">
      <h2 className="th-h2">How this thought changed</h2>
      <ol className="th-rv__hist">
        {rows.map((r, i) => (
          <li key={i} className={r.text ? undefined : 'th-rv__hist--agreed'}>
            <small>
              {dateLabel(r.at)} · {r.label}
            </small>
            {r.text && (
              <p className={r.current ? undefined : 'th-faint'} dir="auto">
                {short(r.text, 200)}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Send the scheduled thoughts to Anki. */
function AnkiPanel({ items }: { items: DeskItem[] }) {
  const { prefs } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const send = async () => {
    setBusy(true);
    try {
      const scheduled = items.filter((i) => i.review && isThought(i));
      const passages = new Map(scheduled.map((i) => [i.id, passageFor(i, items)]));
      const r = await sendThoughts(scheduled, passages, prefs.ankiDeckName || 'Arabic Vocabulary');
      setResult(
        r.sent
          ? `Sent ${r.sent} ${r.sent === 1 ? 'thought' : 'thoughts'} to Anki`
          : scheduled.length
            ? r.failed
              ? `Anki would not take ${r.failed} ${r.failed === 1 ? 'thought' : 'thoughts'}`
              : 'Anki already has them all'
            : 'No scheduled thoughts to send'
      );
    } catch (e) {
      setResult(e instanceof AnkiConnectError && e.kind === 'anki-error' ? `Anki said: ${e.message}` : 'Anki is not running (AnkiConnect)');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="th-panel">
      <h2 className="th-h2">Anki</h2>
      <p className="th-sub">Your scheduled thoughts as cards: the passage on the front, your thought on the back.</p>
      <div className="th-rv__anki">
        <button type="button" className="sd-btn" disabled={busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send to Anki'}
        </button>
        <span className="th-faint" role="status">
          {result}
        </span>
      </div>
    </section>
  );
}
