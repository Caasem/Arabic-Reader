import { BackupControls } from './BackupControls';
import { useEscapeKey } from './useEscapeKey';
import { Note, SettingsSection } from './settings/controls';
import { ReadingSettings } from './settings/ReadingSettings';
import { PomodoroSettings } from './settings/PomodoroSettings';
import { DictionarySettings } from './settings/DictionarySettings';
import { VocabLevelsSettings } from './settings/VocabLevelsSettings';
import { SearchSettings } from './settings/SearchSettings';
import { TouchGestureSettings } from './settings/TouchGestureSettings';
import { AnkiSettings } from './settings/AnkiSettings';
import { DiagnosticsSettings } from './settings/DiagnosticsSettings';
import { CleanReaderSettings } from './settings/CleanReaderSettings';
import { ShamelaBetaSettings } from './settings/ShamelaBetaSettings';
import './SettingsPanel.css';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-panel__header">
          <h2 id="settings-panel-title">Settings</h2>
          <button className="settings-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <ReadingSettings />
        <PomodoroSettings />
        <DictionarySettings />
        <VocabLevelsSettings />
        <SettingsSection title="Backup">
          <Note>
            Your vocabulary, per-word encounter history, and highlights all live only in this browser. Export a backup
            file periodically, or before clearing browser data or switching computers — importing it back in (here or
            in another browser) restores everything. Importing overwrites any local item that shares an id with one in
            the file. The same export/import buttons are also available directly on the Vocabulary and Review tabs.
          </Note>
          <BackupControls />
        </SettingsSection>
        <SearchSettings />
        <TouchGestureSettings />
        <AnkiSettings />
        <CleanReaderSettings />
        <ShamelaBetaSettings />
        <DiagnosticsSettings />
      </div>
    </div>
  );
}
