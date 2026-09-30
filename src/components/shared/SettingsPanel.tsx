import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { DictionarySearchSettings } from '../../dictionarySearch';
import { WasitMatchSettings } from '../../wasitMatch';
import { WasitStructureSettings } from '../../wasitStructure';
import { ShamelaBetaSettings } from './settings/ShamelaBetaSettings';
import './SettingsPanel.css';

function BackupSettings() {
  return (
    <SettingsSection title="Backup">
      <Note>
        Your vocabulary, per-word encounter history, and highlights all live only in this browser. Export a backup file
        periodically, or before clearing browser data or switching computers — importing it back in (here or in another
        browser) restores everything. Importing overwrites any local item that shares an id with one in the file. The
        same export/import buttons are also available directly on the Vocabulary and Review tabs.
      </Note>
      <BackupControls />
    </SettingsSection>
  );
}

/** Settings grouped by what they're for; the sidebar jumps between groups. */
const GROUPS: { id: string; label: string; blurb: string; sections: ReactNode[] }[] = [
  {
    id: 'reading',
    label: 'Reading',
    blurb: 'How books look, turn and respond to touch.',
    sections: [
      <ReadingSettings key="reading" />,
      <CleanReaderSettings key="clean" />,
      <TouchGestureSettings key="touch" />,
      <SearchSettings key="search" />,
      <PomodoroSettings key="pomodoro" />,
    ],
  },
  {
    id: 'dictionary',
    label: 'Dictionary',
    blurb: 'Which dictionaries answer, and how lookups appear.',
    sections: [<DictionarySettings key="dictionaries" />, <DictionarySearchSettings key="dsearch" />, <WasitMatchSettings key="wasitmatch" />, <WasitStructureSettings key="wasitstructure" />],
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    blurb: 'Word levels and syncing your cards.',
    sections: [<VocabLevelsSettings key="levels" />, <AnkiSettings key="anki" />],
  },
  {
    id: 'library',
    label: 'Library & data',
    blurb: 'Where books come from and keeping your data safe.',
    sections: [<ShamelaBetaSettings key="shamela" />, <BackupSettings key="backup" />],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Troubleshooting.',
    sections: [<DiagnosticsSettings key="diagnostics" />],
  },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(GROUPS[0].id);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      let current = GROUPS[0].id;
      for (const group of GROUPS) {
        const heading = el.querySelector<HTMLElement>(`#settings-group-${group.id}`);
        if (heading && heading.offsetTop - el.offsetTop <= el.scrollTop + 24) current = group.id;
      }
      setActive(current);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  function jumpTo(id: string) {
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(`#settings-group-${id}`);
    if (!el || !target) return;
    el.scrollTo({ top: target.offsetTop - el.offsetTop - 8, behavior: 'smooth' });
    setActive(id);
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="settings-panel__nav" aria-label="Settings groups">
          <h2 id="settings-panel-title" className="settings-panel__title">
            Settings
          </h2>
          <ul>
            {GROUPS.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  className={'settings-panel__nav-item' + (active === group.id ? ' settings-panel__nav-item--active' : '')}
                  aria-current={active === group.id ? 'true' : undefined}
                  onClick={() => jumpTo(group.id)}
                >
                  {group.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-panel__main">
          <button className="settings-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="settings-panel__scroll" ref={scrollRef}>
            {GROUPS.map((group) => (
              <div key={group.id} className="settings-group">
                <h3 id={`settings-group-${group.id}`} className="settings-group__title">
                  {group.label}
                </h3>
                <p className="settings-group__blurb">{group.blurb}</p>
                {group.sections}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
