import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { usePreferences } from '../state/PreferencesContext';
import type { ReaderPreferences } from '../types';

type PartKey = Extract<keyof ReaderPreferences, `thinking${string}`>;

/** Each part of the thinking desk has its own switch, under the main one. */
const PARTS: { key: PartKey; label: string; note: string }[] = [
  { key: 'thinkingThreads', label: 'Threads (Alt+T)', note: 'Gather passages and thoughts from any book under one question. The active thread shows under the reader’s header.' },
  { key: 'thinkingMoves', label: 'Argument moves (1–5)', note: 'Name what a passage is doing: تعريف Definition, دعوى Claim, دليل Evidence, اعتراض Objection, جواب Reply. Tagged passages show their label and a coloured underline.' },
  { key: 'thinkingBacklinks', label: 'Backlinks', note: 'A count beside each passage that something touches: thoughts on it, thoughts linked to those, masāʾil, Muqābala links. Click it to see them in the Ḥāshiya.' },
  { key: 'thinkingMasail', label: 'Masāʾil (Alt+Q)', note: 'Ask a question on a passage and keep it open until another passage answers it. See them all, with how long each has waited.' },
];

export function ThinkingSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const on = prefs.thinkingFrontEnabled;
  return (
    <SettingsSection title="Thinking desk">
      <Note>
        Turns the study desk into a place to think: threads that gather from any book, the moves an argument makes, everything that touches a passage,
        questions kept open until a passage answers them, two books side by side, and your own thoughts brought back to judge again.
      </Note>
      <ToggleRow label="Enable the thinking desk" checked={on} onChange={(value) => updatePrefs({ thinkingFrontEnabled: value })}>
        {!prefs.studyDeskEnabled ? 'It needs the study desk (Settings → Dictionary → Study desk).' : undefined}
      </ToggleRow>
      {PARTS.map((p) => (
        <ToggleRow key={p.key} label={p.label} checked={!!prefs[p.key]} disabled={!on} onChange={(value) => updatePrefs({ [p.key]: value })}>
          {p.note}
        </ToggleRow>
      ))}
    </SettingsSection>
  );
}
