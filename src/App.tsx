import { useState } from 'react';
import { NavBar, type ViewName } from './components/shared/NavBar';
import { Library } from './components/library/Library';
import { Reader } from './components/reader/Reader';
import { VocabularyList } from './components/vocabulary/VocabularyList';
import { HighlightsList } from './components/vocabulary/HighlightsList';
import { Review } from './components/review/Review';
import { SpeedReader } from './components/speedReader/SpeedReader';
import { SettingsPanel } from './components/shared/SettingsPanel';
import { BackupReminder } from './components/shared/BackupReminder';
import { PreferencesProvider } from './state/PreferencesContext';
import type { BookMeta } from './types';
import './App.css';

function App() {
  const [view, setView] = useState<ViewName>('library');
  const [activeBook, setActiveBook] = useState<BookMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 'vocabLevels' isn't a separate screen — it's the Reader with its
  // Vocabulary Levels split panel open, so switching to/from it doesn't
  // remount epub.js or lose reading position. The nav bar still shows it as
  // its own tab (see the `navActive` computation below).
  const [vocabPanelOpen, setVocabPanelOpen] = useState(false);

  function openBook(book: BookMeta) {
    setActiveBook(book);
    setView('read');
    setVocabPanelOpen(false);
  }

  function backToLibrary() {
    setView('library');
  }

  function handleNav(next: ViewName) {
    if ((next === 'read' || next === 'vocabLevels') && !activeBook) return;
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
          />
          <main className="app__main">
            {view === 'library' && <Library onOpenBook={openBook} />}
            {view === 'read' && activeBook && (
              <Reader
                book={activeBook}
                onBack={backToLibrary}
                vocabPanelOpen={vocabPanelOpen}
                onVocabPanelOpenChange={setVocabPanelOpen}
              />
            )}
            {view === 'vocabulary' && <VocabularyList />}
            {view === 'highlights' && <HighlightsList />}
            {view === 'review' && <Review />}
            {view === 'speedReader' && <SpeedReader />}
          </main>
        </div>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
    </PreferencesProvider>
  );
}

export default App;
