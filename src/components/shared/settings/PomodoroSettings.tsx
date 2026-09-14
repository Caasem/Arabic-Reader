import { usePreferences } from '../../../state/PreferencesContext';
import type { PomodoroNotification } from '../../../types';
import { type Option, RangeRow, SegmentedRow, SettingsSection, ToggleRow } from './controls';

const NOTIFICATIONS: Option<PomodoroNotification>[] = [
  { id: 'toast', label: 'Toast' },
  { id: 'sound', label: 'Sound' },
  { id: 'silent', label: 'Silent' },
];

export function PomodoroSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Pomodoro">
      <RangeRow
        label="Work duration"
        min={5}
        max={60}
        step={5}
        value={prefs.pomodoroWorkMinutes}
        format={(v) => `${v} min`}
        onChange={(pomodoroWorkMinutes) => updatePrefs({ pomodoroWorkMinutes })}
      />
      <RangeRow
        label="Break duration"
        min={1}
        max={30}
        step={1}
        value={prefs.pomodoroBreakMinutes}
        format={(v) => `${v} min`}
        onChange={(pomodoroBreakMinutes) => updatePrefs({ pomodoroBreakMinutes })}
      />

      <ToggleRow
        label="Auto-start next phase"
        checked={prefs.pomodoroAutoCycle}
        onChange={(pomodoroAutoCycle) => updatePrefs({ pomodoroAutoCycle })}
      >
        On: break starts automatically when work ends, and vice versa. Off: the timer waits for you to start the next
        phase yourself.
      </ToggleRow>

      <ToggleRow
        label="Show phase label (Work / Break)"
        checked={prefs.pomodoroShowPhaseLabel}
        onChange={(pomodoroShowPhaseLabel) => updatePrefs({ pomodoroShowPhaseLabel })}
      />

      <SegmentedRow
        label="Notification"
        options={NOTIFICATIONS}
        value={prefs.pomodoroNotification}
        onChange={(pomodoroNotification) => updatePrefs({ pomodoroNotification })}
      />
    </SettingsSection>
  );
}
