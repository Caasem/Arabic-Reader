import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '../dictionarySearch/Shell';
import '../dictionarySearch/dictionarySearch.css';
import { libraryService } from '../library/libraryService';
import { goToBookLocation, useChordHotkey } from '../readerChords';
import { usePreferences } from '../state/PreferencesContext';
import type { BookMeta, ReaderPreferences } from '../types';
import type { DeskItem } from './types';
import { ConceptStrip } from './ConceptStrip';
import { DeskDocument } from './DeskDocument';
import { InboxBody } from './InboxBody';
import { MarginLayer } from './MarginLayer';
import { registerPdfPageExtension } from '../pdf/pages/extensions';
import { placeOf } from './docEmbeds';
import { cleanLocationNearCentre, goToPdfPlace, parsePdfLocation, pdfLocationNearCentre } from './pageGeometry';
import { publishPdfDeskItems } from './pdfDesk';
import { PdfDeskLayer } from './PdfDeskLayer';
import { PdfMargin } from './PdfMargin';
import { PdfSelect } from './PdfSelect';
import type { PullSpot, PullTarget } from './pullIn';
import { PullInBody } from './PullInBody';
import { RegionCapture } from './RegionCapture';
import { endTrip, startTrip, takeTripNote, takeTripReopen, tripFiledMessage, tripPlacement, useDeskTrip } from './trip';
import { TripBar } from './TripBar';
import { resolveDesk, useDeskData } from './useDesk';
import './studyDesk.css';

const NARROW_QUERY = '(max-width: 600px)';

/** A PDF place to scroll to once another book's pages are showing (Go to source); the host may remount on the way. */
let pendingPdfJump: { bookId: string; location: string } | null = null;

type OpenBook = (book: BookMeta, location?: string) => void;

/** Mounted once beside the active reader; renders nothing when switched off. `onOpenBook` switches books (capture trips). */
export function DeskHost({ book, onOpenBook }: { book: BookMeta; onOpenBook?: OpenBook }) {
  const { prefs } = usePreferences();
  return prefs.studyDeskEnabled ? <Active book={book} style={prefs.dictionarySearchStyle} onOpenBook={onOpenBook} /> : null;
}

function Active({ book, style, onOpenBook }: { book: BookMeta; style: ReaderPreferences['dictionarySearchStyle']; onOpenBook?: OpenBook }) {
  const data = useDeskData(book);
  const { prefs, updatePrefs } = usePreferences();
  const [inbox, setInbox] = useState(false);
  const [concept, setConcept] = useState(false);
  const [region, setRegion] = useState(false);
  /** Pull in, open: the desk it adds to and the place on the page for margin targets. */
  const [pull, setPull] = useState<{ deskId: string; spot: PullSpot | null; fromDocument?: string } | null>(null);
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

  // --- capture trips (trip.ts): away in another book to capture one thing for the book left behind ---
  const trip = useDeskTrip();
  const away = trip && trip.from.id !== book.id ? trip : null;
  const lastBook = useRef(book.id);
  useEffect(() => {
    const came = lastBook.current !== book.id;
    lastBook.current = book.id;
    // Back in the book the trip started from some other way (the library): the trip is over.
    if (came && trip && trip.from.id === book.id) {
      endTrip();
      takeTripReopen(book.id);
    }
    const n = takeTripNote();
    if (n) say(n);
    // Back from a trip that started in the desk document: open it again, at what was captured.
    const back = takeTripReopen(book.id);
    if (back) setDoc({ deskId: back.deskId, itemId: back.itemId });
    // On arriving in a book only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);
  const returnHome = useCallback(
    (message: string, itemId?: string) => {
      const t = endTrip(message, itemId);
      setRegion(false);
      if (t && onOpenBook) onOpenBook(t.from);
    },
    [onOpenBook]
  );
  const goToBook = useCallback(
    async (to: BookMeta, target: PullTarget) => {
      if (!pull || !onOpenBook) return;
      // The desk the capture comes back to must exist before leaving: a capture otherwise falls back to the visited book's own desk.
      const home = await resolveDesk(book, pull.deskId);
      startTrip({ from: book, deskId: home.id, target, spot: pull.spot, to, fromDocument: pull.fromDocument ? home.id : undefined });
      setPull(null);
      setDoc(null);
      onOpenBook(to);
    },
    [pull, onOpenBook, book]
  );

  const desk = data.desks.find((d) => d.id === (away ? away.deskId : data.deskId));
  const deskName = away ? (desk?.kind === 'own' ? desk.title : `${away.from.title}’s desk`) : !desk || (desk.kind === 'book' && desk.bookId === book.id) ? 'this book’s desk' : desk.title;

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
  // Alt+U: Pull in (Alt+P is the saved-entries export).
  const openPull = useCallback(() => {
    setInbox(false);
    setConcept(false);
    setRegion(false);
    // The place is read before the palette covers the page; from the document there is no page to place on.
    const location = doc ? null : (cleanLocationNearCentre() ?? pdfLocationNearCentre());
    setPull({ deskId: doc?.deskId ?? data.deskId, spot: location ? { bookId: book.id, location } : null, fromDocument: doc?.deskId });
  }, [doc, data.deskId, book.id]);
  useChordHotkey('KeyU', true, () => {
    if (pull) setPull(null);
    else openPull();
  });
  useChordHotkey('KeyX', true, () => {
    setConcept(false);
    setInbox(false);
    setRegion((v) => !v);
  });

  // On a trip, Esc with nothing else open goes back without capturing. Read before the reader's own Esc
  // handlers (capture phase), so closing a dictionary popup does not also end the trip.
  useEffect(() => {
    if (!away || inbox || doc || pull || region || concept) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.dict-popup, [role="dialog"]')) return;
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing) return;
      returnHome('Back where you were, nothing captured');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [away, inbox, doc, pull, region, concept, returnHome]);

  // Escape from inside the book reaches the host window.
  useEffect(() => {
    if (!inbox && !doc && !pull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pull) setPull(null);
      else if (inbox) setInbox(false);
      else setDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inbox, doc, pull]);

  const openDocument = useCallback(
    (itemId?: string) => {
      const item = itemId ? data.items.find((i) => i.id === itemId) : undefined;
      setInbox(false);
      setDoc({ deskId: item?.deskId ?? data.deskId, itemId });
    },
    [data.items, data.deskId]
  );
  // Go to source from the document: this book jumps to the place; another book opens there.
  const goToSource = useCallback(
    async (item: DeskItem) => {
      const place = placeOf(item);
      if (!place) return;
      if (place.bookId === book.id) {
        setDoc(null);
        if (!place.location) return;
        const loc = place.location;
        // After the document has gone and the page is back.
        window.requestAnimationFrame(() => {
          const ok = parsePdfLocation(loc) ? goToPdfPlace(loc) : goToBookLocation(loc);
          if (!ok) say('This reader cannot jump there');
        });
        return;
      }
      const other = (await libraryService.listBooks()).find((b) => b.id === place.bookId);
      if (!other || !onOpenBook) return say('That book is not in the library any more');
      setDoc(null);
      // PDF places are scrolled to once the pages are showing; other places open the book there.
      const pdf = place.location && parsePdfLocation(place.location) ? place.location : null;
      pendingPdfJump = pdf ? { bookId: other.id, location: pdf } : null;
      onOpenBook(other, place.location && !pdf ? place.location : undefined);
    },
    [book.id, onOpenBook, say]
  );

  useEffect(() => {
    const jump = pendingPdfJump;
    if (!jump || jump.bookId !== book.id) return;
    pendingPdfJump = null;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (goToPdfPlace(jump.location) || ++tries > 30) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [book.id]);

  // D (no modifier): the desk document, when nothing is being typed and no popup or palette is open. Alt+D
  // stays the dictionary search; the dictionary popup's own D (add a dictionary) only runs while it is open.
  useEffect(() => {
    if (doc || inbox || pull || region || concept) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyD' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.isComposing || e.defaultPrevented) return;
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing || document.querySelector('.dict-popup, [role="dialog"]')) return;
      e.preventDefault();
      openDocument();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, inbox, pull, region, concept, openDocument]);

  // Desk regions on PDF pages: a layer the pages view draws in each page (src/pdf/pages/extensions.ts).
  useEffect(() => registerPdfPageExtension({ id: 'study-desk', Layer: PdfDeskLayer }), []);
  useEffect(() => publishPdfDeskItems(data.items), [data.items]);

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
          <InboxBody book={book} data={data} onClose={() => setInbox(false)} onOpenDocument={openDocument} onPullIn={openPull} onToast={say} />
        </Shell>
      )}
      {pull && (
        <div className="sd-pull-layer">
          <Shell style={narrow ? 'sheet' : style} onClose={() => setPull(null)} title="Pull in" keyHint="Alt U" label="Pull in" posKey="studyDesk.pullPos">
            <PullInBody book={book} deskId={pull.deskId} spot={pull.spot} margins={pull.spot?.location.startsWith('pdf:') && prefs.studyDeskMargins !== 'off' ? 'right' : prefs.studyDeskMargins} onClose={() => setPull(null)} onToast={say} onGoToBook={onOpenBook && !away ? (to, target) => void goToBook(to, target) : undefined} />
          </Shell>
        </div>
      )}
      {book.pdf && <PdfMargin book={book} data={data} onToast={say} onOpenDocument={openDocument} />}
      {book.pdf && !doc && <PdfSelect book={book} data={data} active={!region && !pull} onToast={say} />}
      {!doc && <MarginLayer book={book} data={data} onToast={say} onOpenDocument={openDocument} />}
      {concept && <ConceptStrip book={book} deskId={data.deskId} deskName={deskName} onClose={() => setConcept(false)} onToast={say} />}
      {away && !region && <TripBar trip={away} onCapture={() => (setConcept(false), setInbox(false), setRegion(true))} onCancel={() => returnHome('Back where you were, nothing captured')} />}
      {region && (
        <RegionCapture
          book={book}
          deskId={away ? away.deskId : data.deskId}
          deskName={deskName}
          extra={away ? tripPlacement(away) : undefined}
          onSent={away ? (item) => returnHome(tripFiledMessage(away), item.id) : undefined}
          onClose={closeRegion}
          onToast={say}
        />
      )}
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
          onPullIn={openPull}
          onGoToSource={(item) => void goToSource(item)}
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
