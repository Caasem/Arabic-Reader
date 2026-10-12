import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostProps } from '../features/registry';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { goToBookLocation, useChordHotkey } from '../readerChords';
import { refreshReaderTools, registerReaderTool } from '../readerTools/tools';
import { usePreferences } from '../state/PreferencesContext';
import { goToPdfPlace, parsePdfLocation } from '../studyDesk/pageGeometry';
import { useDeskTrip } from '../studyDesk/trip';
import { currentDeskId } from '../studyDesk/deskMemory';
import { bookDeskId } from '../studyDesk/deskStore';
import { Composer } from './Composer';
import { PassageMoves, PdfPendingMoves, QuietPendingMoves } from './MoveRow';
import { PassageBar } from './PassageBar';
import { publishPassages } from './marksStore';
import { PdfPassageLayer, QuietPassageLayer } from './PassageMarks';
import { isPassage } from './passages';
import { setReadingBook, setThinking, thinkingState, useThinking } from './state';
import { ThreadBar } from './ThreadBar';
import { ThreadPicker } from './ThreadPicker';
import { threadSummaries } from './threads';
import { useThinkingData } from './useThinkingData';
import './thinking.css';

const IconThread = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="5" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <circle cx="19" cy="7" r="2" />
    <path d="M6.5 7.5L10.6 16.4M13.4 16.4L17.7 8.6" />
  </svg>
);

/** The thinking desk beside the open book: the active thread's bar, passage handles and their bar, the thread picker. */
export function ReaderHost({ book }: HostProps) {
  const { prefs } = usePreferences();
  const data = useThinkingData();
  const st = useThinking();
  const trip = useDeskTrip();
  const [picker, setPicker] = useState<{ forItem?: string } | null>(null);
  /** The composer open in the Ḥāshiya strip, on a passage. */
  const [compose, setCompose] = useState<{ on: string } | null>(null);
  const deskId = currentDeskId(book.id) ?? bookDeskId(book.id);
  const toInbox = prefs.studyDeskMarginsToInbox === 'auto';
  const moves = prefs.thinkingMoves;

  const threads = useMemo(() => threadSummaries(data.desks, data.items), [data.desks, data.items]);
  const active = threads.find((s) => s.desk.id === st.active) ?? null;
  const passages = useMemo(() => data.items.filter(isPassage), [data.items]);

  useEffect(() => publishPassages(passages, { moves }), [passages, moves]);
  useEffect(() => registerPdfPageExtension({ id: 'thinking', Layer: PdfPassageLayer }), []);
  useEffect(() => {
    setReadingBook(book);
    return () => setReadingBook(null);
  }, [book]);

  // A place to go to in this book (a screen's Go to source): the PDF pages may still be drawing, so try for a while.
  useEffect(() => {
    const jump = st.jump;
    if (!jump || jump.bookId !== book.id) return;
    setThinking({ jump: null });
    const pdf = parsePdfLocation(jump.location);
    let tries = 0;
    const timer = window.setInterval(() => {
      const ok = pdf ? goToPdfPlace(jump.location) : goToBookLocation(jump.location);
      if (ok || ++tries > 30) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [st.jump, book.id]);

  // Alt+T: the thread picker.
  useChordHotkey('KeyT', prefs.thinkingThreads, () => setPicker((p) => (p ? null : {})));
  const openPicker = useRef(() => setPicker({}));
  useEffect(() => {
    if (!prefs.thinkingThreads) return;
    return registerReaderTool({
      id: 'thinking:thread',
      label: 'Thread',
      title: 'Collect into a thread',
      keys: 'Alt+T',
      group: 'desk',
      order: 10,
      cluster: true,
      readers: ['clean', 'pdf'],
      icon: <IconThread />,
      isOn: () => !!thinkingState().active,
      run: () => openPicker.current(),
    });
  }, [prefs.thinkingThreads]);
  useEffect(() => refreshReaderTools(), [st.active]);

  const selected = st.selected ? data.byId.get(st.selected) : undefined;
  const composing = compose ? data.byId.get(compose.on) : undefined;
  return (
    <>
      {prefs.thinkingThreads && active && !trip && !st.screen && <ThreadBar thread={active} />}
      <QuietPassageLayer bookId={book.id} />
      {selected && isPassage(selected) && selected.source?.bookId === book.id && !compose && (
        <PassageBar item={selected} threads={threads} active={active?.desk.id ?? null} showThreads={prefs.thinkingThreads} onNewThread={() => setPicker({ forItem: selected.id })}>
          {moves && <PassageMoves key={selected.id} item={selected} items={data.items} collect={prefs.thinkingThreads} />}
          <div className="th-row th-acts">
            <button type="button" className="sd-btn" onClick={() => setCompose({ on: selected.id })}>
              Write a thought
            </button>
          </div>
        </PassageBar>
      )}
      {composing && (
        <Composer
          passage={composing}
          book={book}
          deskId={deskId}
          items={data.items}
          desks={data.desks}
          toInbox={toInbox}
          onClose={() => {
            setCompose(null);
            setThinking({ selected: null });
          }}
        />
      )}
      {moves && book.pdf && <PdfPendingMoves collect={prefs.thinkingThreads} />}
      {moves && <QuietPendingMoves book={book} deskId={deskId} toInbox={toInbox} collect={prefs.thinkingThreads} />}
      {picker && (
        <ThreadPicker threads={threads} active={active?.desk.id ?? null} style={prefs.dictionarySearchStyle} forItem={picker.forItem} onClose={() => setPicker(null)} />
      )}
    </>
  );
}
