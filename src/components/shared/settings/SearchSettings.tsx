import { usePreferences } from '../../../state/PreferencesContext';
import { SettingsSection, ToggleRow } from './controls';

export function SearchSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Search">
      <ToggleRow
        label="Live search"
        checked={prefs.liveSearchEnabled}
        onChange={(liveSearchEnabled) => updatePrefs({ liveSearchEnabled })}
      >
        Results update while typing, instead of waiting for you to submit.
      </ToggleRow>
      <ToggleRow
        label="Search history"
        checked={prefs.searchHistoryEnabled}
        onChange={(searchHistoryEnabled) => updatePrefs({ searchHistoryEnabled })}
      >
        Remember recent in-book searches so they can be reused later.
      </ToggleRow>
    </SettingsSection>
  );
}
