import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavBar, type ViewName } from './components/shared/NavBar';
import { Library } from './components/library/Library';
import { ReaderSwitch } from './readerCore/ReaderSwitch';
import { BackupReminder } from './components/shared/BackupReminder';
import { PomodoroNotifier } from './components/pomodoro/PomodoroNotifier';
import { PreferencesProvider } from './state/PreferencesProvider';
import { AutoSync } from './sync/AutoSyncMount';
import { FEATURES } from './features/registry';
import { AnkiAutoSync } from './anki/AnkiAutoSync';
import { onOpenDictionaryPage, type DictionaryPageRequest } from './dictionaryPage/events';
import { fullscreen, isDesktopApp } from './utils/desktop';
import { libraryService } from './library/libraryService';
import { Onboarding, shouldShowOnboarding } from './onboarding';
import { parseRoute, useHashRoute, type Route } from './routing';
import type { BookMeta, Highlight } from './types';
import './App.css';

// Everything except the Library and Reader loads on first visit.
const VocabularyList = lazy(() => import('./components/vocabulary/VocabularyList').then((m) => ({ default: m.VocabularyList })));
const HighlightsList = lazy(() => import('./components/vocabulary/HighlightsList').then((m) => ({ default: m.HighlightsList })));
const Review = lazy(() => import('./components/review/Review').then((m) => ({ default: m.Review })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const SpeedReader = lazy(() => import('./components/speedReader/SpeedReader').then((m) => ({ default: m.SpeedReader })));
const DictionaryPage = lazy(() => import('./dictionaryPage/DictionaryPage').then((m) => ({ default: m.DictionaryPage })));
const SettingsPanel = lazy(() => import('./components/shared/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));

function App() {
  // Read before the PreferencesProvider mounts and remembers anything.
  const [firstRun, setFirstRun] = useState(shouldShowOnboarding);
  // The address (src/routing) the app opened on; not used during the first-run screens.
  const [initialRoute] = useState<Route>(() => (firstRun ? { view: 'library' } : parseRoute(window.location.hash)));
  const [view, setView] = useState<ViewName>(initialRoute.view === 'vocabLevels' ? 'read' : initialRoute.view);
  const [activeBook, setActiveBook] = useState<BookMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which settings group to show first (the reader's own settings links).
  const [settingsGroup, setSettingsGroup] = useState<string | undefined>(undefined);
  // 'vocabLevels' is the Reader with its Vocabulary Levels panel open (so
  // switching doesn't remount epub.js), shown as its own nav tab.
  const [vocabPanelOpen, setVocabPanelOpen] = useState(initialRoute.view === 'vocabLevels');
  // Reader Focus mode went idle: fade the sidebar out too.
  const [chromeHidden, setChromeHidden] = useState(false);
  // In the desktop app, Focus takes the whole screen (title bar included), and
  // leaving Focus gives it back. Only undoes what Focus itself did, so a window
  // the user put into fullscreen with F11 stays that way.
  const focusFullscreen = useRef(false);
  useEffect(() => {
    if (!isDesktopApp()) return;
    if (view === 'read' && chromeHidden) {
      fullscreen.enter();
      focusFullscreen.current = true;
    } else if (focusFullscreen.current) {
      fullscreen.exit();
      focusFullscreen.current = false;
    }
  }, [view, chromeHidden]);
  // A library search result in another book opens at that location instead
  // of the book's saved reading position.
  const [pendingCfi, setPendingCfi] = useState<string | undefined>(undefined);
  // The full-page dictionary (src/dictionaryPage): what to show, and where Back returns to.
  const [dictRequest, setDictRequest] = useState<DictionaryPageRequest | null>(
    initialRoute.view === 'dictionary' && initialRoute.q ? { word: initialRoute.q } : null
  );
  const [dictReturn, setDictReturn] = useState<ViewName>('library');
  const viewRef = useRef(view);
  viewRef.current = view;
  const activeBookRef = useRef(activeBook);
  activeBookRef.current = activeBook;
  useEffect(
    () =>
      onOpenDictionaryPage((request) => {
        if (viewRef.current !== 'dictionary') setDictReturn(viewRef.current);
        setChromeHidden(false);
        setDictRequest(request);
        setView('dictionary');
      }),
    []
  );

  function openBook(book: BookMeta, cfi?: string) {
    setActiveBook(book);
    setPendingCfi(cfi);
    setView('read');
    setVocabPanelOpen(false);
  }

  function backToLibrary() {
    setView('library');
    setChromeHidden(false);
  }

  async function openHighlight(highlight: Highlight): Promise<boolean> {
    const book = (await libraryService.listBooks()).find((b) => b.id === highlight.bookId);
    if (!book) return false;
    openBook(book, highlight.cfiRange);
    return true;
  }

  function handleNav(next: ViewName) {
    if ((next === 'read' || next === 'vocabLevels') && !activeBook) return;
    if (next !== 'read' && next !== 'vocabLevels') setChromeHidden(false);
    // The nav tabs return to the reading position, not an earlier jump target.
    else setPendingCfi(undefined);
    if (next === 'vocabLevels') {
      setVocabPanelOpen(true);
      setView('read');
      return;
    }
    if (next === 'read') setVocabPanelOpen(false);
    if (next === 'dictionary' && view !== 'dictionary') setDictReturn(view);
    setView(next);
  }

  // Routing (src/routing): the address mirrors the screen. A change of address (Back, Forward, a typed URL, the
  // start-up address) is applied to the state below; a change of state is written to the address further down.
  const { route, navigate } = useHashRoute(!firstRun);
  // The book id a route is still loading; the address is left alone until it arrives.
  const loadingBookId = useRef<string | null>(
    initialRoute.view === 'read' || initialRoute.view === 'vocabLevels' ? (initialRoute.bookId ?? null) : null
  );
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    if (firstRun) return;
    if (route.view === 'read' || route.view === 'vocabLevels') {
      const id = route.bookId ?? activeBookRef.current?.id;
      if (!id) {
        navigate({ view: 'library' }, { replace: true });
        setView('library');
        return;
      }
      setChromeHidden(false);
      const open = (book: BookMeta | null) => {
        if (!book) {
          loadingBookId.current = null;
          navigate({ view: 'library' }, { replace: true });
          setView('library');
          return;
        }
        // Coming to the book from another screen returns to the reading position, as the nav tab does.
        if (viewRef.current !== 'read' || activeBookRef.current?.id !== book.id) setPendingCfi(undefined);
        loadingBookId.current = null;
        setActiveBook(book);
        setVocabPanelOpen(route.view === 'vocabLevels');
        setView('read');
      };
      if (activeBookRef.current?.id === id) {
        open(activeBookRef.current);
        return;
      }
      loadingBookId.current = id;
      let stale = false;
      void libraryService.listBooks().then((books) => {
        if (stale || loadingBookId.current !== id) return;
        open(books.find((b) => b.id === id) ?? null);
      });
      return () => {
        stale = true;
      };
    }
    loadingBookId.current = null;
    setChromeHidden(false);
    if (route.view === 'dictionary') {
      if (viewRef.current !== 'dictionary') setDictReturn(viewRef.current);
      const q = route.q;
      setDictRequest((prev) => (q ? (prev?.word === q ? prev : { word: q }) : null));
    }
    setView(route.view);
    // Only a change of address applies a route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, firstRun]);
  useEffect(() => {
    if (firstRun || loadingBookId.current) return;
    if (view === 'read' && activeBook) {
      navigate({ view: vocabPanelOpen ? 'vocabLevels' : 'read', bookId: activeBook.id });
    } else if (view === 'read') {
      navigate({ view: 'library' }, { replace: true });
    } else {
      navigate({ view, q: view === 'dictionary' ? dictRequest?.word : undefined });
    }
  }, [firstRun, view, activeBook, vocabPanelOpen, dictRequest, navigate]);

  const navActive: ViewName = view === 'read' && vocabPanelOpen ? 'vocabLevels' : view;

  return (
    <PreferencesProvider>
      {FEATURES.map(({ id, AppHost }) => AppHost && <AppHost key={id} />)}
      <AutoSync />
      <AnkiAutoSync />
      {firstRun ? (
        <Onboarding onDone={() => setFirstRun(false)} />
      ) : (
      <div className="app">
        <BackupReminder onOpenSettings={() => setSettingsOpen(true)} />
        <div className="app__body">
          <NavBar
            active={navActive}
            onSelect={handleNav}
            readDisabled={!activeBook}
            onOpenSettings={() => setSettingsOpen(true)}
            hidden={view === 'read' && chromeHidden}
          />
          <main className="app__main">
            <Suspense fallback={<div className="app__loading" role="status">Loading…</div>}>
              {view === 'library' && <Library onOpenBook={openBook} onNavigate={handleNav} />}
              {view === 'read' && activeBook && (
                <ReaderSwitch
                  book={activeBook}
                  onBack={backToLibrary}
                  vocabPanelOpen={vocabPanelOpen}
                  onVocabPanelOpenChange={setVocabPanelOpen}
                  onFocusChromeChange={setChromeHidden}
                  initialCfiOverride={pendingCfi}
                  onOpenBookAt={openBook}
                  onOpenSettings={(group) => {
                    setSettingsGroup(group);
                    setSettingsOpen(true);
                  }}
                />
              )}
              {view === 'vocabulary' && <VocabularyList />}
              {view === 'highlights' && <HighlightsList onOpenInBook={openHighlight} />}
              {view === 'review' && <Review />}
              {view === 'speedReader' && <SpeedReader />}
              {view === 'dashboard' && <Dashboard />}
              {view === 'dictionary' && (
                <DictionaryPage
                  request={dictRequest}
                  onBack={() => setView(dictReturn === 'read' && !activeBook ? 'library' : dictReturn)}
                  backLabel={dictReturn === 'read' && activeBook ? 'Back to book' : 'Back'}
                />
              )}
            </Suspense>
          </main>
        </div>
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsPanel
              initialGroup={settingsGroup}
              onClose={() => {
                setSettingsOpen(false);
                setSettingsGroup(undefined);
              }}
            />
          </Suspense>
        )}
        <PomodoroNotifier />
      </div>
      )}
    </PreferencesProvider>
  );
}

export default App;
