import { usePreferences } from '../state/PreferencesContext';
import { Note, SegmentedRow, SettingsSection } from '../components/shared/settings/controls';

const DOCK_STYLES = [
  { id: 'icons', label: 'Icons' },
  { id: 'labels', label: 'Names' },
] as const;

export function QuietReaderSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Reader">
      <SegmentedRow label="Dock" options={DOCK_STYLES} value={prefs.dockStyle} onChange={(dockStyle) => updatePrefs({ dockStyle })} />
      <Note>
        Icons: every tool fits, and a tool shows its name and key when you point at it. Names: each tool is named, and the
        dock scrolls sideways when the window is too narrow for all of them. The reader and PDF pages share the dock.
      </Note>
    </SettingsSection>
  );
}
