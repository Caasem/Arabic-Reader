import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function BookSearchSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Book search (Alt+S)">
      <Note>Press Alt+S while reading to search the whole book from a palette; Enter jumps to the match.</Note>
      <ToggleRow
        label="Enable the Alt+S shortcut"
        checked={prefs.bookSearchEnabled}
        onChange={(value) => updatePrefs({ bookSearchEnabled: value })}
      />
      <Note>
        "Same root" finds every form of the word, using the dictionary's root for each word in the book. Works in the
        EPUB reader, not in Clean Reader.
      </Note>
    </SettingsSection>
  );
}
