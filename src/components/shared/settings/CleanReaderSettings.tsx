import { usePreferences } from '../../../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from './controls';

export function CleanReaderSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Clean text reader (Beta)">
      <Note>
        Shows books as plain text, stripped of the publisher's styling, images and page layout — a simpler,
        steadier way to read Arabic novels.
      </Note>
      <ToggleRow
        label="Read books as clean text"
        checked={prefs.cleanReaderEnabled}
        onChange={(value) => updatePrefs({ cleanReaderEnabled: value })}
      >
        {prefs.cleanReaderEnabled
          ? 'Word lookup and vocabulary still work. Highlights, bookmarks and in-book search are only available in the original reader, which you can switch back to any time.'
          : null}
      </ToggleRow>
    </SettingsSection>
  );
}
