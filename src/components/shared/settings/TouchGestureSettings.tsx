import { usePreferences } from '../../../state/PreferencesContext';
import type { TouchDictionaryAction, TouchGestureBindings } from '../../../types';
import { Note, type Option, SelectRow, SettingsSection } from './controls';

const TOUCH_ACTIONS: Option<TouchDictionaryAction>[] = [
  { id: 'bubble', label: 'Show definition bubble' },
  { id: 'quickSave', label: 'Quick-save to vocabulary' },
  { id: 'openDictionary', label: 'Open full dictionary' },
  { id: 'none', label: 'Off' },
];

const GESTURES: { key: keyof TouchGestureBindings; label: string }[] = [
  { key: 'singleTap', label: 'Single tap' },
  { key: 'doubleTap', label: 'Double tap' },
  { key: 'hold', label: 'Hold (long-press)' },
];

export function TouchGestureSettings() {
  const { prefs, updatePrefs } = usePreferences();

  return (
    <SettingsSection title="Touch gestures">
      <Note>
        On a touchscreen, tapping a word always responds instantly — there's no artificial delay to tell a single tap
        from the start of a double tap. A second quick tap on the same word (within about a third of a second) triggers
        the "Double tap" action below, on top of whatever the first tap already did. These settings have no effect for
        a mouse click, which always opens the full dictionary popup as before.
      </Note>
      {GESTURES.map((gesture) => (
        <SelectRow
          key={gesture.key}
          label={gesture.label}
          options={TOUCH_ACTIONS}
          value={prefs.touchGestures[gesture.key]}
          onChange={(action) => updatePrefs({ touchGestures: { ...prefs.touchGestures, [gesture.key]: action } })}
        />
      ))}
      <Note>
        Hold is off by default: a long-press is also how your phone's own text selection starts (for highlighting), so
        turning Hold on trades a plain long-press-to-select away in favor of whatever action you assign it here.
        Dragging your finger after touching down — to scroll or to select text — always cancels any gesture in
        progress, so none of these ever get in the way of scrolling or highlighting.
      </Note>
    </SettingsSection>
  );
}
