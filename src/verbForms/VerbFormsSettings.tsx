import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function VerbFormsSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Verb forms">
      <ToggleRow
        label="Show the verb form (I-X) in the dictionary"
        checked={prefs.verbFormsEnabled}
        onChange={(value) => updatePrefs({ verbFormsEnabled: value })}
      />
      <Note>
        For a verb, the popup shows which form it is and, on request, the other verbs the dictionary lists for the same
        root. Read from the Arabic Dictionary's own lemma markers; verbs it cannot place (for example hollow verbs)
        show no form.
      </Note>
    </SettingsSection>
  );
}
