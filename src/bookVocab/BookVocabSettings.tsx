import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function BookVocabSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Book vocabulary (Alt+V)">
      <Note>Press Alt+V while reading to see every word you saved from this book; press Alt+V again (or Esc) to close it.</Note>
      <ToggleRow
        label="Enable the Alt+V shortcut"
        checked={prefs.bookVocabEnabled}
        onChange={(value) => updatePrefs({ bookVocabEnabled: value })}
      />
    </SettingsSection>
  );
}
