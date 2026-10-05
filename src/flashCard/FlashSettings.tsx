import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function FlashSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Flashcard (Alt+F)">
      <Note>
        Press Alt+F while reading to write a flashcard of your own: a front and a back, with an optional sentence. Selecting a word in the book fills the
        front. The card floats over the book, can be dragged, and stays open so you can add several; press Alt+F again (or Esc) to close it. Cards are
        reviewed like any saved word.
      </Note>
      <ToggleRow
        label="Enable the Alt+F shortcut"
        checked={prefs.flashCardEnabled}
        onChange={(value) => updatePrefs({ flashCardEnabled: value })}
      />
    </SettingsSection>
  );
}
