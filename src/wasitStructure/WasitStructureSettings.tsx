import { usePreferences } from '../state/PreferencesContext';
import { Note, SelectRow, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import type { ReaderPreferences } from '../types';

const EXAMPLES: { id: ReaderPreferences['wasitStructureExamples']; label: string }[] = [
  { id: 'dim', label: 'Dimmed' },
  { id: 'normal', label: 'Normal' },
];

export function WasitStructureSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Al-Wasīṭ structured view (prototype)">
      <ToggleRow
        label="Show each entry's structure"
        checked={prefs.wasitStructureEnabled}
        onChange={(value) => updatePrefs({ wasitStructureEnabled: value })}
      />
      {prefs.wasitStructureEnabled && (
        <SelectRow
          label="Usage examples and verses"
          options={EXAMPLES}
          value={prefs.wasitStructureExamples}
          onChange={(value) => updatePrefs({ wasitStructureExamples: value })}
        />
      )}
      <Note>
        Separates each derived form, indents the "و-" continuations, bolds the headword line, and marks plurals and register
        abbreviations such as (مج). Nothing is hidden or reworded.
      </Note>
    </SettingsSection>
  );
}
