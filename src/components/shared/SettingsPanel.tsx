import { useEffect, useRef, useState, type ReactElement } from 'react';
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
import { FEATURES, type SettingsGroupId } from '../../features/registry';
import { sectionOrder } from '../../features/placement';
import { ShamelaBetaSettings } from './settings/ShamelaBetaSettings';
import { BrowseLibrarySettings } from './settings/BrowseLibrarySettings';
import { LibrarySettings } from './settings/LibrarySettings';
import { SyncSettings } from './settings/SyncSettings';
import { StorageSettings } from './settings/StorageSettings';
import { QuietReaderSettings } from '../../quietReader/QuietReaderSettings';
import { PdfOcrSettings } from '../../pdf/ocr';
import { PdfHighlighterSettings } from '../../pdf/import/PdfHighlighterSettings';
import { PdfImportSettings } from '../../pdf/import/PdfImportSettings';
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

/**
 * Settings grouped by what they're for; the sidebar jumps between groups. `sections` are the app's own; each feature's
 * section joins its group from the registry (src/features/registry.ts), after the key it names or at the end.
 */
const GROUPS: { id: SettingsGroupId; label: string; blurb: string; sections: ReactElement[] }[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    blurb: 'Colours and the overall look of the app.',
    sections: [],
  },
  {
    id: 'reading',
    label: 'Reading',
    blurb: 'How books look, turn and respond to touch.',
    sections: [
      <QuietReaderSettings key="quiet" />,
      <ReadingSettings key="reading" />,
      <TouchGestureSettings key="touch" />,
      <SearchSettings key="search" />,
      <PomodoroSettings key="pomodoro" />,
      <PdfImportSettings key="pdfimport" />,
      <PdfHighlighterSettings key="pdfhighlighter" />,
      <PdfOcrSettings key="pdfocr" />,
    ],
  },
  {
    id: 'dictionary',
    label: 'Dictionary',
    blurb: 'Which dictionaries answer, and how lookups appear.',
    sections: [<DictionarySettings key="dictionaries" />],
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
    sections: [<LibrarySettings key="librarypage" />, <BrowseLibrarySettings key="browselibrary" />, <ShamelaBetaSettings key="shamela" />, <StorageSettings key="storage" />, <BackupSettings key="backup" />, <SyncSettings key="sync" />],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Troubleshooting.',
    sections: [<DiagnosticsSettings key="diagnostics" />],
  },
];

const featureSections = new Map(FEATURES.flatMap((f) => (f.SettingsSection ? [[f.id, f.SettingsSection] as const] : [])));

/** A group's sections in order: its own, with the features' placed among them. */
function sectionsOf(group: (typeof GROUPS)[number]): ReactElement[] {
  const own = new Map(group.sections.map((el) => [String(el.key), el]));
  return sectionOrder(group.id, [...own.keys()], FEATURES).map((key) => {
    const Section = featureSections.get(key);
    return own.get(key) ?? (Section ? <Section key={key} /> : <></>);
  });
}

export function SettingsPanel({ onClose, initialGroup }: { onClose: () => void; initialGroup?: string }) {
  useEscapeKey(onClose);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(GROUPS[0].id);

  // Opened from a link that names a group (e.g. the reader's "All reading settings").
  useEffect(() => {
    const el = scrollRef.current;
    const target = initialGroup && el?.querySelector<HTMLElement>(`#settings-group-${initialGroup}`);
    if (!el || !target) return;
    el.scrollTop = target.offsetTop - el.offsetTop - 8;
    setActive(initialGroup);
  }, [initialGroup]);

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
                {sectionsOf(group)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
