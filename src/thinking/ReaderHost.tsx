import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostProps } from '../features/registry';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { goToBookLocation, useChordHotkey } from '../readerChords';
import { refreshReaderTools, registerReaderTool } from '../readerTools/tools';
import { usePreferences } from '../state/PreferencesContext';
import { cleanLocationNearCentre, goToPdfPlace, parsePdfLocation, pdfLocationNearCentre } from '../studyDesk/pageGeometry';
import { useDeskTrip } from '../studyDesk/trip';
import { currentDeskId } from '../studyDesk/deskMemory';
import { bookDeskId } from '../studyDesk/deskStore';
import { Composer } from './Composer';
import { PassageMoves, PdfPendingMoves, QuietPendingMoves } from './MoveRow';
import { PassageBar } from './PassageBar';
import { publishPassages } from './marksStore';
import { PdfPassageLayer, QuietPassageLayer } from './PassageMarks';
import { isPassage } from './passages';
import { openScreen, setReadingBook, setThinking, thinkingState, useThinking } from './state';
import { ThreadBar } from './ThreadBar';
import { ThreadPicker } from './ThreadPicker';
import { touchCounts, touching } from './touching';
import { TouchingPanel } from './TouchingPanel';
import { goToItem } from './nav';
import { answerWith, findAnswer } from './actions';
import { HuntBar } from './HuntBar';
import { isOpen } from './masail';
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

const IconQuestion = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" strokeDasharray="3 2.4" />
    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4M12 16.8v.2" />
  </svg>
);

const IconCompare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="2.5" y="4" width="7" height="16" rx="1.5" />
    <rect x="14.5" y="4" width="7" height="16" rx="1.5" />
    <path d="M9.5 9c2 0 3 3 5 3M9.5 15h5" />
  </svg>
);

/** The thinking desk beside the open book: the active thread's bar, passage handles and their bar, the thread picker. */
export function ReaderHost({ book, onOpenBook }: HostProps) {
  const { prefs } = usePreferences();
  const data = useThinkingData();
  const st = useThinking();
  const trip = useDeskTrip();
  const [picker, setPicker] = useState<{ forItem?: string } | null>(null);
  /** The composer open in the Ḥāshiya strip: a thought on a passage, or a masʾala on a passage or at a place. */
  const [compose, setCompose] = useState<{ kind: 'thought' | 'question'; on?: string; place?: string } | null>(null);
  const deskId = currentDeskId(book.id) ?? bookDeskId(book.id);
  const toInbox = prefs.studyDeskMarginsToInbox === 'auto';
  const moves = prefs.thinkingMoves;

  const threads = useMemo(() => threadSummaries(data.desks, data.items), [data.desks, data.items]);
  const active = threads.find((s) => s.desk.id === st.active) ?? null;
  const passages = useMemo(() => data.items.filter(isPassage), [data.items]);

  // Backlinks: counted for this book's passages only (the badges on the page).
  const counts = useMemo(
    () => (prefs.thinkingBacklinks ? touchCounts(passages.filter((p) => p.source?.bookId === book.id), data.items, data.links, data.byId) : new Map<string, number>()),
    [prefs.thinkingBacklinks, passages, book.id, data.items, data.links, data.byId]
  );
  useEffect(() => publishPassages(passages, { moves, counts }), [passages, moves, counts]);
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

  // Alt+Q: a new masʾala, on the passage in the bar or at this place on the page.
  const ask = () => {
    const on = st.selected && data.byId.get(st.selected)?.source?.bookId === book.id ? st.selected : undefined;
    setCompose({ kind: 'question', on, place: on ? undefined : (cleanLocationNearCentre() ?? pdfLocationNearCentre() ?? undefined) });
  };
  useChordHotkey('KeyQ', prefs.thinkingMasail, () => (compose ? setCompose(null) : ask()));
  // Alt+J: Muqābala, with the passage in the bar picked on the left.
  const compare = () => openScreen({ kind: 'muqabala', a: st.selected && data.byId.get(st.selected)?.source?.bookId === book.id ? st.selected : undefined });
  useChordHotkey('KeyJ', prefs.thinkingMuqabala, compare);
  useEffect(() => {
    if (!prefs.thinkingMuqabala) return;
    return registerReaderTool({
      id: 'thinking:muqabala',
      label: 'Compare',
      title: 'Muqābala: two books side by side',
      keys: 'Alt+J',
      group: 'desk',
      order: 12,
      readers: ['clean', 'pdf'],
      icon: <IconCompare />,
      run: () => openScreen({ kind: 'muqabala' }),
    });
  }, [prefs.thinkingMuqabala]);
  useEffect(() => {
    if (!prefs.thinkingMasail) return;
    return registerReaderTool({
      id: 'thinking:masail',
      label: 'Masāʾil',
      title: 'Your questions, open and answered',
      keys: 'Alt+Q',
      group: 'desk',
      order: 11,
      readers: ['clean', 'pdf'],
      icon: <IconQuestion />,
      run: () => openScreen({ kind: 'masail' }),
    });
  }, [prefs.thinkingMasail]);

  const selected = st.selected ? data.byId.get(st.selected) : undefined;
  const composing = compose?.on ? data.byId.get(compose.on) : undefined;
  const hunted = prefs.thinkingMasail && st.hunting ? data.byId.get(st.hunting) : undefined;
  const hunting = hunted && isOpen(hunted, data.byId) ? hunted : undefined;
  const touched = prefs.thinkingBacklinks && st.touch ? data.byId.get(st.touch) : undefined;
  return (
    <>
      {hunting && !trip && !st.screen && <HuntBar question={hunting} quiet={!!selected || !!compose} />}
      {prefs.thinkingThreads && active && !trip && !st.screen && !hunting && <ThreadBar thread={active} />}
      <QuietPassageLayer bookId={book.id} />
      {selected && isPassage(selected) && selected.source?.bookId === book.id && !compose && hunting && (
        <PassageBar item={selected} threads={threads} active={null} showThreads={false} onNewThread={() => {}} title="Does this answer the masʾala?">
          <div className="th-row">
            <button type="button" className="sd-btn sd-btn--pri" onClick={() => void answerWith(hunting, selected)}>
              Yes, this answers it
            </button>
            <button type="button" className="sd-btn th-btn--ghost" onClick={() => setThinking({ selected: null })}>
              Not this one
            </button>
          </div>
        </PassageBar>
      )}
      {selected && isPassage(selected) && selected.source?.bookId === book.id && !compose && !hunting && (
        <PassageBar item={selected} threads={threads} active={active?.desk.id ?? null} showThreads={prefs.thinkingThreads} onNewThread={() => setPicker({ forItem: selected.id })}>
          {moves && <PassageMoves key={selected.id} item={selected} items={data.items} collect={prefs.thinkingThreads} />}
          <div className="th-row th-acts">
            <button type="button" className="sd-btn" onClick={() => setCompose({ kind: 'thought', on: selected.id })}>
              Write a thought
            </button>
            {prefs.thinkingMasail && (
              <button type="button" className="sd-btn" onClick={() => setCompose({ kind: 'question', on: selected.id })}>
                Ask a masʾala <kbd>Alt Q</kbd>
              </button>
            )}
            {prefs.thinkingMuqabala && (
              <button type="button" className="sd-btn" onClick={compare}>
                Compare <kbd>Alt J</kbd>
              </button>
            )}
          </div>
        </PassageBar>
      )}
      {compose && (compose.kind === 'question' || composing) && (
        <Composer
          kind={compose.kind}
          passage={composing}
          place={compose.place}
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
      {touched && touched.source?.bookId === book.id && !compose && (
        <TouchingPanel
          passage={touched}
          touches={touching(touched, data.items, data.links, data.byId)}
          onGoTo={(item) => void goToItem(item, onOpenBook)}
          actions={(t) =>
            t.kind === 'question' && prefs.thinkingMasail && isOpen(t.item, data.byId) ? (
              <button type="button" className="th-link" onClick={() => void findAnswer(t.item, onOpenBook)}>
                Find the answer
              </button>
            ) : t.kind === 'link' && prefs.thinkingMuqabala ? (
              <button type="button" className="th-link" onClick={() => openScreen({ kind: 'muqabala', link: t.link.id })}>
                Open side by side
              </button>
            ) : null
          }
        />
      )}
      {(moves || hunting) && book.pdf && <PdfPendingMoves collect={prefs.thinkingThreads} answering={hunting} />}
      {(moves || hunting) && <QuietPendingMoves book={book} deskId={deskId} toInbox={toInbox} collect={prefs.thinkingThreads} answering={hunting} />}
      {picker && (
        <ThreadPicker threads={threads} active={active?.desk.id ?? null} style={prefs.dictionarySearchStyle} forItem={picker.forItem} onClose={() => setPicker(null)} />
      )}
    </>
  );
}
