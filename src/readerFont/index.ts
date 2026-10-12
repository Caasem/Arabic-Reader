/**
 * Picking the Arabic font, including fonts the reader uploads (kept on the device in their own IndexedDB database,
 * never bundled or backed up). Picking the built-in font restores the original look.
 *
 * The app wires it through `readerFontFeature` in src/features/registry.ts; the other touch points are listed in it.
 * To remove the feature, delete this folder, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import './readerFont.css';
import { FontSettings } from './FontSettings';
import { ReadingFontSync } from './ReadingFontSync';

export const readerFontFeature: FeatureDescriptor = {
  id: 'readerFont',
  AppHost: ReadingFontSync,
  SettingsSection: FontSettings,
  settingsGroup: 'reading',
  settingsAfter: 'reading',
  touchPoints: [
    'the `fontFamily` and `readingFontAppWide` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    "the new reader's Display sheet, which lists the fonts (useFontChoices, FONT_FILE_ACCEPT) (src/quietReader/DisplaySheet.tsx)",
    'its fonts database (FONTS_DB) in the storage registry (src/storage/registry.ts) and the storage usage report (src/storage/usage.ts)',
    'removing an uploaded font from Storage settings (src/components/shared/settings/StorageSettings.tsx)',
  ],
};

export { useFontChoices, type FontChoice } from './useFontChoices';
export { FONT_FILE_ACCEPT, FONT_SAMPLE } from './fontStack';
