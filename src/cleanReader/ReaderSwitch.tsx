import { lazy, type ComponentProps } from 'react';
import { Reader } from '../components/reader/Reader';
import { usePreferences } from '../state/PreferencesContext';

const CleanReader = lazy(() => import('./CleanReader').then((m) => ({ default: m.CleanReader })));

type ReaderSwitchProps = ComponentProps<typeof Reader> & {
  /** Clean Reader's Focus went idle: the app-level sidebar should hide too. */
  onFocusChromeChange?(hidden: boolean): void;
};

/**
 * The single place that chooses between the epub reader and the clean-text
 * reader. To remove the clean reader entirely: put <Reader> back in App.tsx,
 * delete this folder, and drop the `cleanReaderEnabled` preference and its
 * settings row (CleanReaderSettings).
 */
export function ReaderSwitch({ onFocusChromeChange, ...props }: ReaderSwitchProps) {
  const { prefs } = usePreferences();
  return prefs.cleanReaderEnabled ? (
    <CleanReader book={props.book} onBack={props.onBack} onFocusChromeChange={onFocusChromeChange} />
  ) : (
    <Reader {...props} />
  );
}
