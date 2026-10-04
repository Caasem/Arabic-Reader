import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function WasitMatchSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Al-Wasīṭ match highlight (prototype)">
      <ToggleRow
        label="Colour the entry that matches the word you looked up"
        checked={prefs.wasitMatchHighlight}
        onChange={(value) => updatePrefs({ wasitMatchHighlight: value })}
      />
      <Note>
        Al-Wasīṭ groups every form of a root together; this colours the form you tapped (or its base form) so it's easy to find. In
        Al-Ṣiḥāḥ it colours the opening word of the line that begins with that form.
      </Note>
    </SettingsSection>
  );
}
