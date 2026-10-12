import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';

export function WasitMatchSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Land on the word in root dictionaries">
      <ToggleRow
        label="Colour the entry that matches the word you looked up"
        checked={prefs.wasitMatchHighlight}
        onChange={(value) => updatePrefs({ wasitMatchHighlight: value })}
      />
      <ToggleRow
        label="Scroll to it when it's out of view"
        checked={prefs.subEntryScroll}
        disabled={!prefs.wasitMatchHighlight}
        onChange={(value) => updatePrefs({ subEntryScroll: value })}
      />
      <ToggleRow
        label="Order readings by the vowels written in the text, greying the ones that don't match"
        checked={prefs.vowelRanking}
        onChange={(value) => updatePrefs({ vowelRanking: value })}
      />
      <Note>
        Al-Wasīṭ, Al-Ṣiḥāḥ, Lane's Lexicon and Hans Wehr file every word of a root in one long article. This colours the
        line about the word you tapped (or its dictionary form; for a verb, its form's paragraph) and scrolls the popup to
        it. The rest of the article stays there above and below. A word with no root (إدام, قيراط) opens the article the
        dictionary files it under.
      </Note>
    </SettingsSection>
  );
}
