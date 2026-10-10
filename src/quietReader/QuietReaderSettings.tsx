import { usePreferences } from '../state/PreferencesContext';
import { Note, SegmentedRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

const DOCK_STYLES = [
  { id: 'icons', label: 'Icons' },
  { id: 'labels', label: 'Names' },
] as const;

export function QuietReaderSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Reader">
      <ToggleRow label="New reader" checked={prefs.quietReaderEnabled} onChange={(quietReaderEnabled) => updatePrefs({ quietReaderEnabled })}>
        Books open as clean text with one dock at the bottom and everything else in a book drawer. A book that reads
        better in its original layout can switch back under Display → View. Turn this off to return to the previous
        readers.
      </ToggleRow>
      <SegmentedRow label="Dock" options={DOCK_STYLES} value={prefs.dockStyle} onChange={(dockStyle) => updatePrefs({ dockStyle })} />
      <Note>
        Icons: every tool fits, and a tool shows its name and key when you point at it. Names: each tool is named, and the
        dock scrolls sideways when the window is too narrow for all of them. The reader and PDF pages share the dock.
      </Note>
    </SettingsSection>
  );
}
