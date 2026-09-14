import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Book } from 'epubjs';
import { EpubService, type RelocatedLocation, type SelectionInfo } from '../../../reader/epub/EpubService';
import { ReadingSessionTracker } from '../../../reader/session/ReadingSessionTracker';
import { annotationService } from '../../../reader/annotations/annotationService';
import { libraryService } from '../../../library/libraryService';
import { persistenceService } from '../../../persistence/db';
import type { BookMeta, Highlight, ReaderPreferences, TocItem } from '../../../types';
import type { ResolvedTheme } from '../../../state/PreferencesContext';

export interface ReaderLocation {
  chapterLabel?: string;
  percent: number;
  /** "Page N of Total" once the book's locations index exists. */
  pageLabel?: string;
  atPageEnd: boolean;
}

interface Options {
  book: BookMeta;
  containerRef: RefObject<HTMLDivElement | null>;
  trackerRef: RefObject<ReadingSessionTracker | null>;
  prefsRef: RefObject<ReaderPreferences>;
  themeRef: RefObject<ResolvedTheme>;
  /** Opens at this CFI instead of the saved reading position (a search result in another book). */
  initialCfiOverride?: string;
  /** Changing this reopens the book: epub.js can't swap view managers on a live rendition. */
  reopenKey: string;
  onSectionRendered(doc: Document, sectionHref: string): void;
  onRelocated(location: RelocatedLocation): void;
  onSelected(info: SelectionInfo): void;
  onHighlightClick?(highlight: Highlight, event: Event): void;
}

/**
 * Opens a book into the container and keeps its lifecycle: reading position
 * (restored and saved), the session tracker, saved highlights, and the cached
 * locations index behind page numbers.
 */
export function useEpubReader(options: Options) {
  const { book, containerRef, trackerRef, prefsRef, themeRef, reopenKey } = options;
  // Callbacks are read through a ref, so callers needn't memoize them.
  const eventsRef = useRef(options);
  useLayoutEffect(() => {
    eventsRef.current = options;
  });

  const serviceRef = useRef<EpubService | null>(null);
  const currentLocationRef = useRef<RelocatedLocation | null>(null);
  const openedBookIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [bookHandle, setBookHandle] = useState<Book | null>(null);
  const [location, setLocation] = useState<ReaderLocation>({ percent: 0, atPageEnd: false });

  useEffect(() => {
    let cancelled = false;
    const svc = new EpubService();
    serviceRef.current = svc;

    (async () => {
      try {
        const file = await libraryService.getBookFile(book.id);
        const container = containerRef.current;
        if (!file || !container) throw new Error('Could not read this book file.');
        const savedPos = await persistenceService.getReadingPosition(book.id);
        if (cancelled) return;

        // Reopening the same book (a view-manager change) resumes exactly where
        // the reader is; a different book starts from its own position.
        const sameBook = openedBookIdRef.current === book.id;
        openedBookIdRef.current = book.id;
        const resumeCfi = sameBook ? currentLocationRef.current?.cfi : undefined;
        if (!sameBook) currentLocationRef.current = null;
        const startCfi = resumeCfi ?? eventsRef.current.initialCfiOverride ?? savedPos?.cfi;

        // Started before the first render, so the first section counts too.
        const tracker = new ReadingSessionTracker(book.id, book.title, savedPos?.percent ?? 0);
        tracker.start();
        trackerRef.current = tracker;
        setLocation({ chapterLabel: savedPos?.chapterLabel, percent: savedPos?.percent ?? 0, atPageEnd: false });

        await svc.open(file, container, {
          startCfi,
          prefs: prefsRef.current,
          theme: themeRef.current,
          onRendered: (doc, href) => eventsRef.current.onSectionRendered(doc, href),
          onSelected: (info) => eventsRef.current.onSelected(info),
          onRelocated: (loc) => {
            currentLocationRef.current = loc;
            setLocation({ chapterLabel: loc.chapterLabel, percent: loc.percent, pageLabel: svc.getPageLabel(loc.cfi), atPageEnd: !!loc.atPageEnd });
            trackerRef.current?.recordPercent(loc.percent);
            void persistenceService.saveReadingPosition({
              bookId: book.id,
              cfi: loc.cfi,
              percent: loc.percent,
              chapterHref: loc.chapterHref,
              chapterLabel: loc.chapterLabel,
              updatedAt: Date.now(),
            });
            eventsRef.current.onRelocated(loc);
          },
        });
        if (cancelled) return;
        setToc(svc.getToc());
        setBookHandle(svc.getBookHandle());
        setReady(true);

        // epub.js renders registered highlights as their sections come into view.
        annotationService
          .listForBook(book.id)
          .then((highlights) => {
            if (cancelled) return;
            for (const h of highlights) svc.renderHighlight(h.cfiRange, h.color, (e) => eventsRef.current.onHighlightClick?.(h, e));
          })
          .catch(() => {});

        // Page numbers: restore the cached locations index, or build it in the
        // background (it walks the whole book) and cache it for next time.
        persistenceService
          .getBookLocations(book.id)
          .then(async (cached) => {
            if (cancelled) return;
            if (cached) {
              svc.loadLocations(cached.data);
              return;
            }
            const total = await svc.generateLocations();
            const serialized = cancelled ? null : svc.serializeLocations();
            if (serialized) await persistenceService.saveBookLocations(book.id, serialized, total);
          })
          .catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this book.');
      }
    })();

    return () => {
      cancelled = true;
      void trackerRef.current?.finish();
      trackerRef.current = null;
      svc.destroy();
    };
  }, [book.id, book.title, reopenKey, containerRef, trackerRef, prefsRef, themeRef]);

  return { serviceRef, currentLocationRef, ready, error, toc, bookHandle, location };
}
