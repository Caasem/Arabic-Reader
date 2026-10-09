import { usePreferences } from '../../../state/PreferencesContext';
import { SettingsSection, ToggleRow } from './controls';

export function BrowseLibrarySettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Browse library">
      <ToggleRow label="Show the quality badge" checked={prefs.browseShowQuality} onChange={(value) => updatePrefs({ browseShowQuality: value })}>
        Clean, Some errors or Poor scan on each result, from a sample of the book's first pages checked against the dictionary. It reads a small part of every book on screen, so it is off by default.
      </ToggleRow>
    </SettingsSection>
  );
}
