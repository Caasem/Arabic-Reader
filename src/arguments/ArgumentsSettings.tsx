import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { paintSupported } from '../readerCore/paint';
import { usePreferences } from '../state/PreferencesContext';

export function ArgumentsSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Argument layer">
      <Note>
        Mark what words do in an argument: claim, grounds, warrant, backing, qualifier, exception, objection, reply. Press Alt+A in the reader, select words, press 1 to 8, and
        Enter takes the suggested target. Alt+Shift+A opens the sheet: your marks laid out as an argument, with what is missing listed under it.
      </Note>
      <ToggleRow label="Enable the argument layer (Alt+A)" checked={prefs.argumentsEnabled} onChange={(value) => updatePrefs({ argumentsEnabled: value })}>
        {!prefs.studyDeskEnabled
          ? 'It needs the study desk (Settings → Dictionary → Study desk).'
          : prefs.thinkingFrontEnabled && prefs.thinkingMoves
            ? 'While it is on, the thinking desk’s five argument moves are off.'
            : !paintSupported
              ? 'Marks are not drawn on this device (iOS before 17.2), but they are saved.'
              : undefined}
      </ToggleRow>
    </SettingsSection>
  );
}
