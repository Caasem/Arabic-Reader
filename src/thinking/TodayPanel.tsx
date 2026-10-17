import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LibraryTopProps } from '../features/registry';
import { getReadingSessions } from '../persistence/sessionsRepo';
import { usePreferences } from '../state/PreferencesContext';
import type { DeskItem } from '../studyDesk/types';
import type { ReadingSession } from '../types';
import { wordsOf } from './labels';
import { masail } from './masail';
import { goToItem, openBookById } from './nav';
import { ago, dateLabel, short, thoughtText } from './passages';
import { dueThoughts } from './revisit';
import { say } from './say';
import { openScreen, readingBook, setThinking } from './state';
import { growth, joinedAt, liveThreads, threadLabel, threadMembers, threadSummaries, type ThreadSummary } from './threads';
import { onThisDay, weekMinutes, type DayBook, type DayLook } from './today';
import { useThinkingData } from './useThinkingData';
import './thinking.css';

const LIST = 4;
const THREADS = 3;

const longDate = (at: number): string => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "<em>Book</em>, 4 pages, for 38 minutes". */
function BookClause({ book }: { book: DayBook }) {
  return (
    <>
      <em>{book.title || 'a book'}</em>
      {book.pages > 0 && `, ${count(book.pages, 'page', 'pages')}`}
      {book.minutes > 0 && `${book.pages > 0 ? ', ' : ' '}for ${count(book.minutes, 'minute', 'minutes')}`}
    </>
  );
}

/** What happened on a day, as one sentence built from what exists. */
function Sentence({ look }: { look: DayLook }) {
  const clauses: ReactNode[] = [];
  if (look.books.length) {
    const shown = look.books.slice(0, 2);
    clauses.push(
      <>
        read{' '}
        {shown.map((b, i) => (
          <Fragment key={b.bookId}>
            {i > 0 && ' and '}
            <BookClause book={b} />
          </Fragment>
        ))}
        {look.books.length > shown.length && `, and ${look.books.length - shown.length} more`}
      </>
    );
  } else if (look.lines.length) {
    clauses.push(
      <>
        closed <em>{look.lines[0].bookTitle || 'a book'}</em>
      </>
    );
  }
  if (look.threads.length) {
    const names = look.threads.slice(0, 2).map((t) => t.title);
    clauses.push(`started the ${names.join(' and ')} ${names.length === 1 ? 'thread' : 'threads'}`);
  }
  if (!clauses.length && look.revised.length) clauses.push('wrote a thought you have since revised');
  return (
    <>
      On {longDate(look.date)} you{' '}
      {clauses.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && (i === clauses.length - 1 ? ', and ' : ', ')}
          {c}
        </Fragment>
      ))}
      .
    </>
  );
}

function OnThisDay({ year, half, onOpenBook }: { year: DayLook | null; half: DayLook | null; onOpenBook: LibraryTopProps['onOpenBook'] }) {
  const { prefs } = usePreferences();
  const main = year ?? half;
  if (!main) return null;
  const second = year ? half : null;
  const swap = main.revised[0];
  const line = main.lines[0];
  return (
    <section className="th-today__card th-today__card--day" aria-label="On this day">
      <span className="th-eyebrow">On this day · {main.period === 'year' ? 'a year ago' : 'six months ago'}</span>
      <p className="th-today__sentence">
        <Sentence look={main} />
      </p>
      {swap && (
        <div className="th-today__pair">
          <div>
            <span className="th-eyebrow">What you wrote then</span>
            <p dir="auto">{short(swap.then, 140)}</p>
          </div>
          <div className="th-today__pair-now">
            <span className="th-eyebrow">What you hold now · revised {dateLabel(swap.revisedAt)}</span>
            <p dir="auto">{short(swap.now, 140)}</p>
          </div>
        </div>
      )}
      {line && <p className="th-today__closing">“{short(line.text, 160)}”</p>}
      {swap && (
        <div className="th-row">
          <button type="button" className="sd-btn" onClick={() => void goToItem(swap.item, onOpenBook)}>
            Open the page
          </button>
          {prefs.thinkingRevisit && (
            <button type="button" className="sd-btn" onClick={() => openScreen({ kind: 'revisit', id: swap.item.id })}>
              Revisit this thought
            </button>
          )}
        </div>
      )}
      {second && (
        <p className="th-today__also">
          <span className="th-eyebrow">Six months ago</span> <Sentence look={second} />
        </p>
      )}
    </section>
  );
}

/** Members added over the last year, as an inline sparkline. */
function Spark({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * w : w);
  const y = (v: number) => h - 2 - (v / max) * (h - 5);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="th-today__spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Growth over the last year">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--accent-soft)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ThreadRow({ summary, items, now }: { summary: ThreadSummary; items: DeskItem[]; now: number }) {
  const members = threadMembers(summary.desk.id, items);
  const dates = members.map((m) => joinedAt(m, summary.desk.id));
  const since = dates.length ? Math.min(...dates) : summary.desk.createdAt;
  return (
    <li className="th-today__thread">
      <div className="th-today__thread-head">
        <span className="th-today__thread-name" dir="auto">
          {threadLabel(summary.desk)}
        </span>
        <Spark values={growth(dates, now)} />
      </div>
      <p className="th-today__meta">
        {summary.count} gathered from {count(summary.books, 'book', 'books')} since {dateLabel(since)} · last added {ago(summary.lastAdded, now)}
      </p>
      <button type="button" className="th-link" onClick={() => openScreen({ kind: 'thread', id: summary.desk.id })}>
        Open
      </button>
    </li>
  );
}

/** Above the Library's shelves (docs/features/thinking-front.md, Today): On this day, thoughts to revisit, open masāʾil and threads. */
export function TodayPanel({ onOpenBook }: LibraryTopProps) {
  const { prefs } = usePreferences();
  const data = useThinkingData();
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    void getReadingSessions().then((s) => alive && setSessions(s), () => undefined);
    return () => void (alive = false);
  }, []);

  const day = useMemo(() => onThisDay(now, { journal: data.journal, sessions, items: data.items, desks: data.desks }), [now, data.journal, sessions, data.items, data.desks]);
  const due = useMemo(() => (prefs.thinkingRevisit ? dueThoughts(data.items, now) : []), [prefs.thinkingRevisit, data.items, now]);
  const open = useMemo(() => (prefs.thinkingMasail ? masail(data.items, data.byId, 'open') : []), [prefs.thinkingMasail, data.items, data.byId]);
  const threads = useMemo(
    () => (prefs.thinkingThreads ? liveThreads(threadSummaries(data.desks, data.items)).filter((s) => s.count > 0).slice(0, THREADS) : []),
    [prefs.thinkingThreads, data.desks, data.items]
  );
  const minutes = useMemo(() => weekMinutes(sessions, now), [sessions, now]);

  if (!data.loaded) return null;
  const hasDay = !!(day.year || day.half);
  if (!hasDay && !due.length && !open.length && !threads.length) return null;

  const find = async (id: string, bookId: string | undefined) => {
    // Hunting is set first, so the reader's bar is there when the book opens.
    setThinking({ hunting: id });
    const opened = bookId ? await openBookById(bookId, onOpenBook) : false;
    if (!opened && !readingBook()) say('Open a book to look for the answer');
  };

  return (
    <section className="th-today" aria-label="Today">
      <header className="th-today__head">
        <span className="th-eyebrow">Today</span>
        {minutes > 0 && <span className="th-today__week">You have read for {count(minutes, 'minute', 'minutes')} this week.</span>}
      </header>
      <div className="th-today__grid">
        {hasDay && <OnThisDay year={day.year} half={day.half} onOpenBook={onOpenBook} />}
        {due.length > 0 && (
          <section className="th-today__card" aria-label="Thoughts to revisit">
            <span className="th-eyebrow">Revisit</span>
            <h3 className="th-today__title">{count(due.length, 'thought', 'thoughts')} to revisit</h3>
            <ul className="th-today__list">
              {due.slice(0, LIST).map((t) => (
                <li key={t.id}>
                  <button type="button" className="th-today__item" dir="auto" onClick={() => openScreen({ kind: 'revisit', id: t.id })}>
                    {short(thoughtText(t), 70)}
                  </button>
                </li>
              ))}
            </ul>
            {due.length > LIST && (
              <button type="button" className="th-link" onClick={() => openScreen({ kind: 'revisit' })}>
                See all {due.length}
              </button>
            )}
          </section>
        )}
        {open.length > 0 && (
          <section className="th-today__card" aria-label="Open masāʾil">
            <span className="th-eyebrow">Masāʾil</span>
            <h3 className="th-today__title">{count(open.length, 'open masʾala', 'open masāʾil')}</h3>
            <ul className="th-today__list">
              {open.slice(0, LIST).map((q) => (
                <li key={q.id} className="th-today__q">
                  <span className="th-today__item th-today__item--text" dir="auto">
                    {short(wordsOf(q), 60)}
                  </span>
                  <span className="th-today__meta">
                    asked {ago(q.createdAt, now)} ·{' '}
                    <button type="button" className="th-link" onClick={() => void find(q.id, q.source?.bookId)}>
                      Find the answer
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {open.length > LIST && (
              <button type="button" className="th-link" onClick={() => openScreen({ kind: 'masail' })}>
                See all {open.length}
              </button>
            )}
          </section>
        )}
        {threads.length > 0 && (
          <section className="th-today__card" aria-label="Threads">
            <span className="th-eyebrow">Threads</span>
            <ul className="th-today__list">
              {threads.map((s) => (
                <ThreadRow key={s.desk.id} summary={s} items={data.items} now={now} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
