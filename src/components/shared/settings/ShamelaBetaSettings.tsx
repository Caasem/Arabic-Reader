import { usePreferences } from '../../../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from './controls';

export function ShamelaBetaSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Shamela Library (Beta)">
      <Note>
        Browse and download books directly from the Shamela Library (المكتبة الشاملة), one of the
        largest collections of Arabic Islamic texts.
      </Note>
      <ToggleRow
        label="Enable Shamela Integration"
        checked={prefs.shamelaEnabled}
        onChange={(value) => updatePrefs({ shamelaEnabled: value })}
      >
        {prefs.shamelaEnabled
          ? 'Search for books in the Library tab. Downloaded books are saved locally and available offline.'
          : null}
      </ToggleRow>
    </SettingsSection>
  );
}
