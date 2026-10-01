import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function PopupCleanSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Dictionary popup layout">
      <ToggleRow
        label="Clean popup layout"
        checked={prefs.dictionaryPopupCleanLayout}
        onChange={(value) => updatePrefs({ dictionaryPopupCleanLayout: value })}
      />
      <Note>
        Everything lines up on one edge with more room. For a verb, press its root to see its form (I-X), or tap the
        verb to see the root's other verbs. Turn it off to get the classic popup back.
      </Note>
    </SettingsSection>
  );
}
