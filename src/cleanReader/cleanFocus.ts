import { readString, writeString } from '../utils/storage';

const FOCUS_KEY = 'arabic-reader:cleanFocus';

/** Whether Clean Reader should open straight into Focus. Set from Classic
 * Mode's own Focus button, which switches readers and enters Focus in one step. */
export function loadCleanFocus(): boolean {
  return readString(FOCUS_KEY) === '1';
}

export function saveCleanFocus(focus: boolean): void {
  writeString(FOCUS_KEY, focus ? '1' : '0');
}
