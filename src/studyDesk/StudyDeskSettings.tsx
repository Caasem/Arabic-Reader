import { Note, SegmentedRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';

export function StudyDeskSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Study desk (Alt+I, Alt+C, Alt+X, Alt+M)">
      <Note>
        Everything you capture while reading lands in an inbox and, at the same time, at the end of a desk: a free text document for the book, or one
        of your own. Alt+I opens the inbox (in the same style as the Alt+D search), Alt+C writes a concept, Alt+X captures a region of the page.
      </Note>
      <ToggleRow label="Enable the study desk" checked={prefs.studyDeskEnabled} onChange={(value) => updatePrefs({ studyDeskEnabled: value })} />
      <Note>Ḥāshiya (Alt+M): the margins of the page, where items sit beside the lines they belong to. Double-tap empty space there to write a note.</Note>
      <SegmentedRow
        label="Ḥāshiya"
        options={[
          { id: 'both', label: 'Both sides' },
          { id: 'right', label: 'Right only' },
          { id: 'left', label: 'Left only' },
          { id: 'off', label: 'Hidden' },
        ]}
        value={prefs.studyDeskMargins}
        onChange={(value) => updatePrefs({ studyDeskMargins: value })}
      />
      <SegmentedRow
        label="Ḥāshiya notes in the document"
        options={[
          { id: 'all', label: 'All' },
          { id: 'chosen', label: 'Only chosen' },
          { id: 'none', label: 'None' },
        ]}
        value={prefs.studyDeskMarginsInDocument}
        onChange={(value) => updatePrefs({ studyDeskMarginsInDocument: value })}
      />
      <SegmentedRow
        label="Send Ḥāshiya notes to the inbox"
        options={[
          { id: 'ask', label: 'When I choose' },
          { id: 'auto', label: 'Automatically' },
        ]}
        value={prefs.studyDeskMarginsToInbox}
        onChange={(value) => updatePrefs({ studyDeskMarginsToInbox: value })}
      />
    </SettingsSection>
  );
}
