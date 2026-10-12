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
    <>
    <SettingsSection title="Al-Wasīṭ structured view (prototype)">
      <ToggleRow
        label="Show each entry's structure"
        checked={prefs.wasitStructureEnabled}
        onChange={(value) => updatePrefs({ wasitStructureEnabled: value })}
      />
      <ToggleRow
        label="Show labels and plurals as badges"
        checked={prefs.wasitLabelsEnabled}
        disabled={!prefs.wasitStructureEnabled}
        onChange={(value) => updatePrefs({ wasitLabelsEnabled: value })}
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
        Separates each derived form, indents the "و-" continuations, bolds the headword line, and marks plurals (ج) and the labels (مج) (مو) (مع) (د)
        as small badges; hover one for its meaning. Nothing is hidden or reworded.
      </Note>
    </SettingsSection>
    <SettingsSection title="Al-Ṣiḥāḥ verses">
      <ToggleRow
        label="Set quoted verses apart, one line each with the two halves side by side"
        checked={prefs.sihahVerseLayout}
        onChange={(value) => updatePrefs({ sihahVerseLayout: value })}
      />
      <Note>
        Only verses whose halves the editors closed with a star are laid out; the rest stay in the running text. Nothing
        is reworded.
      </Note>
    </SettingsSection>
    </>
  );
}
