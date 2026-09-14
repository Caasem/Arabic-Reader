import { lazy, Suspense, useState } from 'react';
import { NavBar, type ViewName } from './components/shared/NavBar';
import { Library } from './components/library/Library';
import { Reader } from './components/reader/Reader';
import { BackupReminder } from './components/shared/BackupReminder';
import { PomodoroNotifier } from './components/pomodoro/PomodoroNotifier';
import { PreferencesProvider } from './state/PreferencesProvider';
import type { BookMeta } from './types';
import './App.css';

// Everything except the Library and Reader loads on first visit.
const VocabularyList = lazy(() => import('./components/vocabulary/VocabularyList').then((m) => ({ default: m.VocabularyList })));
const HighlightsList = lazy(() => import('./components/vocabulary/HighlightsList').then((m) => ({ default: m.HighlightsList })));
const Review = lazy(() => import('./components/review/Review').then((m) => ({ default: m.Review })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const SpeedReader = lazy(() => import('./components/speedReader/SpeedReader').then((m) => ({ default: m.SpeedReader })));
const SettingsPanel = lazy(() => import('./components/shared/SettingsPanel').then((m) => ({ default: m.SettingsPanel })));

function App() {
  const [view, setView] = useState<ViewName>('library');
  const [activeBook, setActiveBook] = useState<BookMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 'vocabLevels' is the Reader with its Vocabulary Levels panel open (so
  // switching doesn't remount epub.js), shown as its own nav tab.
  const [vocabPanelOpen, setVocabPanelOpen] = useState(false);
  // Reader Focus mode went idle: fade the sidebar out too.
  const [chromeHidden, setChromeHidden] = useState(false);
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

  function handleNav(next: ViewName) {
    if ((next === 'read' || next === 'vocabLevels') && !activeBook) return;
    if (next !== 'read' && next !== 'vocabLevels') setChromeHidden(false);
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
                <Reader
                  book={activeBook}
                  onBack={backToLibrary}
                  vocabPanelOpen={vocabPanelOpen}
                  onVocabPanelOpenChange={setVocabPanelOpen}
                  onFocusChromeChange={setChromeHidden}
                  initialCfiOverride={pendingCfi}
                  onOpenBookAt={openBook}
                />
              )}
              {view === 'vocabulary' && <VocabularyList />}
              {view === 'highlights' && <HighlightsList />}
              {view === 'review' && <Review />}
              {view === 'speedReader' && <SpeedReader />}
              {view === 'dashboard' && <Dashboard />}
            </Suspense>
          </main>
        </div>
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsPanel onClose={() => setSettingsOpen(false)} />
          </Suspense>
        )}
        <PomodoroNotifier />
      </div>
    </PreferencesProvider>
  );
}

export default App;
