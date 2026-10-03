import { usePreferences } from '../state/PreferencesContext';
import { SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function QuietReaderSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Reader">
      <ToggleRow label="New reader" checked={prefs.quietReaderEnabled} onChange={(quietReaderEnabled) => updatePrefs({ quietReaderEnabled })}>
        Books open as clean text with one dock at the bottom and everything else in a book drawer. A book that reads
        better in its original layout can switch back under Display → View. Turn this off to return to the previous
        readers.
      </ToggleRow>
    </SettingsSection>
  );
}
