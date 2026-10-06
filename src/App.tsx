import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavBar, type ViewName } from './components/shared/NavBar';
import { Library } from './components/library/Library';
import { ReaderSwitch } from './cleanReader/ReaderSwitch';
import { BackupReminder } from './components/shared/BackupReminder';
import { PomodoroNotifier } from './components/pomodoro/PomodoroNotifier';
import { PreferencesProvider } from './state/PreferencesProvider';
import { LookSkin } from './look';
import { ReadingFontSync } from './readerFont';
import { AutoSync } from './sync/AutoSyncMount';
import { CrowdSyncHost } from './crowdSync';
import { fullscreen, isDesktopApp } from './utils/desktop';
import { libraryService } from './library/libraryService';
import { Onboarding, shouldShowOnboarding } from './onboarding';
import type { BookMeta, Highlight } from './types';
import './App.css';

// Everything except the Library and Reader loads on first visit.
const VocabularyList = lazy(() => import('./components/vocabulary/VocabularyList').then((m) => ({ default: m.VocabularyList })));
const HighlightsList = lazy(() => import('./components/vocabulary/HighlightsList').then((m) => ({ default: m.HighlightsList })));
const Review = lazy(() => import('./components/review/Review').then((m) => ({ default: m.Review })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const SpeedReader = lazy(() => import('./components/speedReader/SpeedReader').then((m) => ({ default: m.SpeedReader })));
const SettingsPanel = lazy(() => import('./components/shared/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));

function App() {
  // Read before the PreferencesProvider mounts and remembers anything.
  const [firstRun, setFirstRun] = useState(shouldShowOnboarding);
  const [view, setView] = useState<ViewName>('library');
  const [activeBook, setActiveBook] = useState<BookMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which settings group to show first (the reader's own settings links).
  const [settingsGroup, setSettingsGroup] = useState<string | undefined>(undefined);
  // 'vocabLevels' is the Reader with its Vocabulary Levels panel open (so
  // switching doesn't remount epub.js), shown as its own nav tab.
  const [vocabPanelOpen, setVocabPanelOpen] = useState(false);
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
    setView(next);
  }

  const navActive: ViewName = view === 'read' && vocabPanelOpen ? 'vocabLevels' : view;

  return (
    <PreferencesProvider>
      <LookSkin />
      <ReadingFontSync />
      <AutoSync />
      <CrowdSyncHost />
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
              {view === 'library' && <Library onOpenBook={openBook} />}
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
