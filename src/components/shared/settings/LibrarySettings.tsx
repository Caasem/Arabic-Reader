import { usePreferences } from '../../../state/PreferencesContext';
import { RangeRow, SettingsSection, ToggleRow } from './controls';

export function LibrarySettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Library page">
      <ToggleRow label="Show a highlight of yours" checked={prefs.libraryShowQuote} onChange={(value) => updatePrefs({ libraryShowQuote: value })}>
        One of your highlights at the top of the Library, with a way back to it in the book.
      </ToggleRow>
      <ToggleRow label="Show reading habits" checked={prefs.libraryShowHabits} onChange={(value) => updatePrefs({ libraryShowHabits: value })}>
        Streak, today's reading against your goal, words saved and flashcards due.
      </ToggleRow>
      <RangeRow label="Daily reading goal" min={5} max={120} step={5} value={prefs.dailyGoalMinutes} format={(v) => `${v} min`} onChange={(v) => updatePrefs({ dailyGoalMinutes: v })} />
    </SettingsSection>
  );
}
