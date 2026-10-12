import { useMemo, useState } from 'react';
import { DeskDocument } from '../../studyDesk/DeskDocument';
import { createThread, leaveThread, saveDeskHtml, updateDesk } from '../../studyDesk/deskStore';
import { appendEmbed, hasEmbed } from '../../studyDesk/docHtml';
import { looksArabic } from '../../studyDesk/useDesk';
import type { Desk, DeskItem } from '../../studyDesk/types';
import { goToItem, type OpenBook } from '../nav';
import { dateLabel, isPassage } from '../passages';
import { openScreen, setThinking, useThinking, type Screen, type ThreadTab } from '../state';
import { byBook, joinedAt, namesFromTyped, summarise, threadLabel, threadMembers, threadSummaries } from '../threads';
import { say } from '../say';
import { useThinkingData, type ThinkingData } from '../useThinkingData';
import { Frame, Tabs } from './Frame';
import { ItemLine } from './parts';

/** Colours for books on the timeline, in the order books first joined. */
const BOOK_COLOURS = ['var(--th-claim)', 'var(--th-objection)', 'var(--th-evidence)', 'var(--th-question)', 'var(--th-definition)', 'var(--th-reply)'];

/**
 * A thread: a desk that belongs to a question. Its names and guiding question, how much it has gathered, and tabs:
 * its document (the desk document, embedded), and what it gathered by book and over time, and its masāʾil.
 * Phases after threads add their own tabs (Argument).
 */
export function ThreadScreen({ screen, onOpenBook }: { screen: Extract<Screen, { kind: 'thread' }>; onOpenBook?: OpenBook }) {
  const data = useThinkingData();
  const { active } = useThinking();
  const threads = useMemo(() => threadSummaries(data.desks, data.items), [data.desks, data.items]);
  const id = screen.id && threads.some((s) => s.desk.id === screen.id) ? screen.id : (threads.find((s) => s.desk.id === active) ?? threads[0])?.desk.id;
  const thread = data.desks.find((d) => d.id === id);
  const [tab, setTab] = useState<ThreadTab>(screen.tab ?? 'document');

  if (!data.loaded) return <div className="th-screen th-screen--loading" role="status">Loading…</div>;
  if (!thread) return <NoThreads />;
  const summary = summarise(thread, data.items);
  const goTo = (item: DeskItem) => void goToItem(item, onOpenBook);
  const questions = threadMembers(thread.id, data.items).filter((i) => i.type === 'question');
  const open = questions.filter((q) => !q.answer || !data.byId.has(q.answer)).length;

  return (
    <Frame
      eyebrow="Thread"
      wide
      title={<Names key={thread.id} desk={thread} />}
      aside={
        <select className="th-switch" aria-label="Switch thread" value={thread.id} onChange={(e) => (e.target.value === '+' ? void newThread() : openScreen({ kind: 'thread', id: e.target.value, tab }))}>
          {threads.map((s) => (
            <option key={s.desk.id} value={s.desk.id}>
              {threadLabel(s.desk)}
            </option>
          ))}
          <option value="+">+ New thread</option>
        </select>
      }
    >
      <Question key={thread.id + ':' + (thread.question ?? '')} desk={thread} />
      <div className="th-stats">
        <span>
          <b>{summary.count}</b> gathered
        </span>
        <span>
          <b>{summary.books}</b> {summary.books === 1 ? 'book' : 'books'}
        </span>
        <span>
          since <b>{dateLabel(thread.createdAt)}</b>
        </span>
        <button
          type="button"
          className={'sd-btn' + (active === thread.id ? '' : ' sd-btn--pri')}
          aria-pressed={active === thread.id}
          onClick={() => {
            setThinking({ active: active === thread.id ? null : thread.id });
            say(active === thread.id ? 'Stopped collecting' : `Collecting into ${threadLabel(thread)}`);
          }}
        >
          {active === thread.id ? 'Collecting while reading ✓' : 'Collect while reading'}
        </button>
      </div>
      <Tabs<ThreadTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'document', label: 'Document' },
          { id: 'gathered', label: 'Gathered' },
          { id: 'masail', label: `Masāʾil · ${open} open` },
        ]}
      />
      {tab === 'document' && (
        <div className="th-docwrap">
          <DeskDocument
            key={thread.id}
            data={{ desks: data.desks, items: data.items, deskId: thread.id, setDeskId: () => {} }}
            deskId={thread.id}
            embedded
            onClose={() => setThinking({ screen: null })}
            onSwitchDesk={(d) => openScreen({ kind: 'thread', id: d })}
            onGoToSource={goTo}
            onToast={say}
          />
        </div>
      )}
      {tab === 'gathered' && <Gathered thread={thread} data={data} onGoTo={goTo} />}
      {tab === 'masail' && (
        <div className="th-list">
          {!questions.length && <p className="th-empty">No masāʾil in this thread yet. Ask one on a passage while it is collecting.</p>}
          {questions.map((q) => (
            <ItemLine key={q.id} item={q} dim={!!q.answer} acts={q.source?.location ? <button type="button" className="th-link" onClick={() => goTo(q)}>Open page ↗</button> : undefined} />
          ))}
        </div>
      )}
    </Frame>
  );
}

async function newThread() {
  const t = await createThread({ title: 'Untitled thread' });
  openScreen({ kind: 'thread', id: t.id });
}

function NoThreads() {
  const [name, setName] = useState('');
  return (
    <Frame eyebrow="Thread" title="No threads yet">
      <p className="th-sub">A thread gathers passages and thoughts from any book under one question. Name one to start.</p>
      <form
        className="th-newthread"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void createThread(namesFromTyped(name, looksArabic(name))).then((t) => {
            setThinking({ active: t.id });
            openScreen({ kind: 'thread', id: t.id });
          });
        }}
      >
        <input className="th-input" dir="auto" value={name} placeholder="النية, or Everything on intention" aria-label="Name of the thread" onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" className="sd-btn sd-btn--pri" disabled={!name.trim()}>
          Start the thread
        </button>
      </form>
    </Frame>
  );
}

/** The thread's Arabic and English names, edited in place. */
function Names({ desk }: { desk: Desk }) {
  const [ar, setAr] = useState(desk.titleAr ?? '');
  const [en, setEn] = useState(desk.titleAr && desk.title === desk.titleAr ? '' : desk.title);
  const save = () => {
    const a = ar.trim();
    const e = en.trim();
    if (!a && !e) return;
    void updateDesk(desk.id, { titleAr: a || undefined, title: e || a });
  };
  return (
    <span className="th-names">
      <input className="th-name th-ar" dir="rtl" lang="ar" value={ar} placeholder="الاسم" aria-label="Arabic name" onChange={(e) => setAr(e.target.value)} onBlur={save} />
      <span className="th-names__dot" aria-hidden="true">
        ·
      </span>
      <input className="th-name" dir="auto" value={en} placeholder="English name" aria-label="English name" onChange={(e) => setEn(e.target.value)} onBlur={save} />
    </span>
  );
}

/** The guiding question, edited in place. */
function Question({ desk }: { desk: Desk }) {
  const [q, setQ] = useState(desk.question ?? '');
  return (
    <textarea
      className="th-guiding"
      dir="auto"
      rows={1}
      value={q}
      placeholder="The guiding question: what do you want to find out?"
      aria-label="Guiding question"
      onChange={(e) => setQ(e.target.value)}
      onBlur={() => q.trim() !== (desk.question ?? '') && void updateDesk(desk.id, { question: q.trim() || undefined })}
      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
    />
  );
}

/** What the thread gathered: a dot per item over time, then the items by book. */
function Gathered({ thread, data, onGoTo }: { thread: Desk; data: ThinkingData; onGoTo(item: DeskItem): void }) {
  const members = threadMembers(thread.id, data.items);
  const groups = byBook(members);
  const colour = new Map(groups.map((g, i) => [g.bookId, BOOK_COLOURS[i % BOOK_COLOURS.length]]));
  const [now] = useState(() => Date.now());
  const start = thread.createdAt;
  const span = Math.max(1, now - start);
  const inDoc = (id: string) => hasEmbed(thread.html, id);
  return (
    <>
      <section className="th-panel">
        <h2 className="th-h2">Over time</h2>
        <div className="th-timeline" role="img" aria-label={`${members.length} items added since ${dateLabel(start)}`}>
          <div className="th-timeline__axis" />
          {members.map((m, i) => (
            <span
              key={m.id}
              className="th-timeline__dot"
              title={`${dateLabel(joinedAt(m, thread.id))} · ${m.source?.bookTitle ?? 'Your own'}`}
              style={{ left: `${((joinedAt(m, thread.id) - start) / span) * 100}%`, top: 20 - (i % 3) * 7, background: colour.get(m.source?.bookId ?? null) }}
            />
          ))}
          <span className="th-timeline__tick" style={{ left: 0 }}>
            {dateLabel(start)}
          </span>
          <span className="th-timeline__tick th-timeline__tick--end">today</span>
        </div>
        <div className="th-legend">
          {groups.map((g) => (
            <span key={g.bookId ?? 'own'}>
              <i style={{ background: colour.get(g.bookId) }} />
              <bdi>{g.bookTitle}</bdi>
            </span>
          ))}
        </div>
      </section>
      {!members.length && <p className="th-empty">Nothing gathered yet. Turn on Collect while reading, or add a passage from its bar.</p>}
      {groups.map((g) => (
        <section key={g.bookId ?? 'own'} className="th-group">
          <h3 className="th-group__h">
            <bdi>{g.bookTitle}</bdi>
            <span>{g.items.length}</span>
          </h3>
          <div className="th-list">
            {g.items.map((item) => (
              <ItemLine
                key={item.id}
                item={item}
                acts={
                  <>
                    {item.source?.location && (
                      <button type="button" className="th-link" onClick={() => onGoTo(item)}>
                        {isPassage(item) ? 'Open page ↗' : 'Go to ↗'}
                      </button>
                    )}
                    {inDoc(item.id) ? (
                      <span className="th-faint" title="In the document">
                        ✓
                      </span>
                    ) : (
                      <button type="button" className="th-icon" title="Put it in the document" aria-label="Put it in the document" onClick={() => void saveDeskHtml(thread.id, appendEmbed(thread.html, item.id)).then(() => say('Put at the end of the document'))}>
                        +
                      </button>
                    )}
                    <button type="button" className="th-icon" title="Take it out of the thread" aria-label="Take it out of the thread" onClick={() => void leaveThread(item.id, thread.id).then(() => say('Taken out of the thread'))}>
                      ×
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
