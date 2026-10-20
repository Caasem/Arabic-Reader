import { Note, SelectRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';

const STYLES = [
  { id: 'underline', label: 'Underline' },
  { id: 'wash', label: 'Soft wash' },
  { id: 'marker', label: 'Marker' },
] as const;

const TAGS = [
  { id: 'label', label: 'Label' },
  { id: 'chip', label: 'Chip' },
  { id: 'letter', label: 'Initial only' },
  { id: 'off', label: 'None' },
] as const;

export function ArgumentsSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Argument layer">
      <Note>
        Mark what words do in an argument: claim, grounds, warrant, backing, qualifier, exception, objection, reply. Select words and press 1 to 8 (or pick a role in the
        selection bar); Enter takes the suggested target. Alt+Shift+A opens the sheet: your marks laid out as an argument, with what is missing listed under it. The Layers button
        (in the sheet, and in the status line) turns page marks, margin cards, the sheet and each kind of reader note on or off.
      </Note>
      <ToggleRow label="Enable the argument layer (Alt+A)" checked={prefs.argumentsEnabled} onChange={(value) => updatePrefs({ argumentsEnabled: value })}>
        {!prefs.studyDeskEnabled
          ? 'It needs the study desk (Settings → Dictionary → Study desk).'
          : prefs.thinkingFrontEnabled && prefs.thinkingMoves
            ? 'While it is on, the thinking desk’s five argument moves are off.'
            : undefined}
      </ToggleRow>
      <SelectRow label="How highlights and marks look" options={STYLES} value={prefs.markStyle} onChange={(markStyle) => updatePrefs({ markStyle })} />
      <SelectRow label="Role label on argument marks" options={TAGS} value={prefs.argumentsTag} onChange={(argumentsTag) => updatePrefs({ argumentsTag })} />
    </SettingsSection>
  );
}
