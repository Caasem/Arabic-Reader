import { usePreferences } from '../state/PreferencesContext';
import { Note, SelectRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import type { ReaderPreferences } from '../types';

const STYLES: { id: ReaderPreferences['dictionarySearchStyle']; label: string }[] = [
  { id: 'floating', label: 'Floating card (default)' },
  { id: 'palette', label: 'Command palette' },
  { id: 'drawer', label: 'Side drawer' },
  { id: 'sheet', label: 'Bottom sheet' },
];

export function DictionarySearchSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Dictionary search (D key)">
      <Note>Press D while reading to open a dictionary search; press D again (or Esc) to close it.</Note>
      <ToggleRow
        label="Enable the D shortcut"
        checked={prefs.dictionarySearchEnabled}
        onChange={(value) => updatePrefs({ dictionarySearchEnabled: value })}
      />
      {prefs.dictionarySearchEnabled && (
        <SelectRow
          label="Search style"
          options={STYLES}
          value={prefs.dictionarySearchStyle}
          onChange={(value) => updatePrefs({ dictionarySearchStyle: value })}
        />
      )}
      <Note>Searches Arabic words only. On narrow screens the bottom sheet is always used.</Note>
    </SettingsSection>
  );
}
