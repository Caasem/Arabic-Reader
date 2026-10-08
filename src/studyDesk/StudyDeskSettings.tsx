import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';

export function StudyDeskSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Study desk (Alt+I, Alt+C, Alt+X)">
      <Note>
        Everything you capture while reading lands in an inbox and, at the same time, at the end of a desk: a free text document for the book, or one
        of your own. Alt+I opens the inbox (in the same style as the Alt+D search), Alt+C writes a concept, Alt+X captures a region of the page.
      </Note>
      <ToggleRow label="Enable the study desk" checked={prefs.studyDeskEnabled} onChange={(value) => updatePrefs({ studyDeskEnabled: value })} />
    </SettingsSection>
  );
}
