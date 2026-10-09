import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';

export function AnnotateSettings() {
  const { prefs, updatePrefs } = usePreferences();
  return (
    <SettingsSection title="Ink and sketches (Alt+W, Alt+K)">
      <Note>
        Write and draw straight on the page with a pen, a finger or the mouse (Alt+W, or Write in the dock or the PDF bar). On PDF pages the ink stays where
        it was written at every zoom; in the reader it is tied to the word it starts on and moves with the text. Alt+K opens a sketch sheet beside the page
        for freehand notes or a diagram of nodes and arrows, saved with that page or passage.
      </Note>
      <ToggleRow label="Enable ink and sketches" checked={prefs.annotateEnabled} onChange={(value) => updatePrefs({ annotateEnabled: value })} />
    </SettingsSection>
  );
}
