import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '../dictionarySearch/Shell';
import '../dictionarySearch/dictionarySearch.css';
import { useChordHotkey } from '../readerChords';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, ReaderPreferences } from '../types';
import { ConceptStrip } from './ConceptStrip';
import { DeskDocument } from './DeskDocument';
import { InboxBody } from './InboxBody';
import { MarginLayer } from './MarginLayer';
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
  const { prefs, updatePrefs } = usePreferences();
  const [inbox, setInbox] = useState(false);
  const [concept, setConcept] = useState(false);
  const [region, setRegion] = useState(false);
  /** The desk document, open on a desk (and maybe an item to show). */
  const [doc, setDoc] = useState<{ deskId: string; itemId?: string } | null>(null);
  /** A capture started from the document goes back to it. */
  const backToDoc = useRef<string | null>(null);
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

  useChordHotkey('KeyI', true, () => {
    if (doc) return;
    setInbox((v) => !v);
  });
  useChordHotkey('KeyC', true, () => {
    setRegion(false);
    setConcept((v) => !v);
  });
  // Alt+M: margins on and off; back on in the layout they had.
  useChordHotkey('KeyM', true, () => {
    if (prefs.studyDeskMargins !== 'off') {
      try {
        localStorage.setItem('studyDesk.lastMargins', prefs.studyDeskMargins);
      } catch {
        // Comes back as both sides.
      }
      updatePrefs({ studyDeskMargins: 'off' });
      say('Margins hidden. Alt+M shows them again.');
    } else {
      let last: ReaderPreferences['studyDeskMargins'] = 'both';
      try {
        const v = localStorage.getItem('studyDesk.lastMargins');
        if (v === 'left' || v === 'right' || v === 'both') last = v;
      } catch {
        // Both sides.
      }
      updatePrefs({ studyDeskMargins: last });
    }
  });
  useChordHotkey('KeyX', true, () => {
    setConcept(false);
    setInbox(false);
    setRegion((v) => !v);
  });

  // Escape from inside the book reaches the host window.
  useEffect(() => {
    if (!inbox && !doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (inbox) setInbox(false);
      else setDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inbox, doc]);

  const openDocument = useCallback(
    (itemId?: string) => {
      const item = itemId ? data.items.find((i) => i.id === itemId) : undefined;
      setInbox(false);
      setDoc({ deskId: item?.deskId ?? data.deskId, itemId });
    },
    [data.items, data.deskId]
  );
  const closeRegion = useCallback(() => {
    setRegion(false);
    if (backToDoc.current) {
      const deskId = backToDoc.current;
      backToDoc.current = null;
      setDoc({ deskId });
    }
  }, []);

  return (
    <>
      {inbox && (
        <Shell style={narrow ? 'sheet' : style} onClose={() => setInbox(false)} title="Inbox" keyHint="Alt I" label="Inbox" posKey="studyDesk.inboxPos">
          <InboxBody book={book} data={data} onClose={() => setInbox(false)} onOpenDocument={openDocument} onToast={say} />
        </Shell>
      )}
      {!doc && <MarginLayer book={book} data={data} onToast={say} onOpenDocument={openDocument} />}
      {concept && <ConceptStrip book={book} deskId={data.deskId} deskName={deskName} onClose={() => setConcept(false)} onToast={say} />}
      {region && <RegionCapture book={book} deskId={data.deskId} deskName={deskName} onClose={closeRegion} onToast={say} />}
      {doc && (
        <DeskDocument
          book={book}
          data={data}
          deskId={doc.deskId}
          focusItem={doc.itemId}
          onClose={() => setDoc(null)}
          onSwitchDesk={(id) => {
            data.setDeskId(id);
            setDoc({ deskId: id });
          }}
          onCapture={() => {
            backToDoc.current = doc.deskId;
            data.setDeskId(doc.deskId);
            setDoc(null);
            setRegion(true);
          }}
          onToast={say}
        />
      )}
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
