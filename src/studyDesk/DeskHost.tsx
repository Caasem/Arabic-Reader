import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '../dictionarySearch/Shell';
import '../dictionarySearch/dictionarySearch.css';
import { useChordHotkey } from '../readerChords';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, ReaderPreferences } from '../types';
import { ConceptStrip } from './ConceptStrip';
import { InboxBody } from './InboxBody';
import { RegionCapture } from './RegionCapture';
import { useDeskData } from './useDesk';
import './studyDesk.css';

const NARROW_QUERY = '(max-width: 600px)';

/** Mounted once beside the active reader; renders nothing when switched off. */
export function DeskHost({ book }: { book: BookMeta }) {
  const { prefs } = usePreferences();
  return prefs.studyDeskEnabled ? <Active book={book} style={prefs.dictionarySearchStyle} /> : null;
}

function Active({ book, style }: { book: BookMeta; style: ReaderPreferences['dictionarySearchStyle'] }) {
  const data = useDeskData(book);
  const [inbox, setInbox] = useState(false);
  const [concept, setConcept] = useState(false);
  const [region, setRegion] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const narrow = useNarrow();

  const say = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const desk = data.desks.find((d) => d.id === data.deskId);
  const deskName = !desk || (desk.kind === 'book' && desk.bookId === book.id) ? 'this book’s desk' : desk.title;

  useChordHotkey('KeyI', true, () => setInbox((v) => !v));
  useChordHotkey('KeyC', true, () => {
    setRegion(false);
    setConcept((v) => !v);
  });
  useChordHotkey('KeyX', true, () => {
    setConcept(false);
    setInbox(false);
    setRegion((v) => !v);
  });

  // Escape from inside the book reaches the host window.
  useEffect(() => {
    if (!inbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setInbox(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inbox]);

  const openDocument = useCallback(() => say('The desk document arrives in the next step'), [say]);

  return (
    <>
      {inbox && (
        <Shell style={narrow ? 'sheet' : style} onClose={() => setInbox(false)} title="Inbox" keyHint="Alt I" label="Inbox" posKey="studyDesk.inboxPos">
          <InboxBody book={book} data={data} onClose={() => setInbox(false)} onOpenDocument={openDocument} onToast={say} />
        </Shell>
      )}
      {concept && <ConceptStrip book={book} deskId={data.deskId} deskName={deskName} onClose={() => setConcept(false)} onToast={say} />}
      {region && <RegionCapture book={book} deskId={data.deskId} deskName={deskName} onClose={() => setRegion(false)} onToast={say} />}
      {toast && (
        <div className="sd-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
