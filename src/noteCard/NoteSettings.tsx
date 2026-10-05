import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function NoteSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Note (Alt+N)">
      <Note>
        Press Alt+N while reading to write a note on the selected text, or on the first sentence of the page when nothing is selected. The card floats
        over the book, can be dragged, and stays open so you can keep reading and note more; press Alt+N again (or Esc) to close it.
      </Note>
      <ToggleRow
        label="Enable the Alt+N shortcut"
        checked={prefs.noteCardEnabled}
        onChange={(value) => updatePrefs({ noteCardEnabled: value })}
      />
    </SettingsSection>
  );
}
