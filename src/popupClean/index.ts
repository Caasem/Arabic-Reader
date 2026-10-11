/**
 * Clean dictionary popup layout: aligned on one edge, more white space, one-row header, round add buttons in their
 * own column (also per Al-Wasit sub-entry), the verb form shown by pressing a root, other forms by tapping the verb.
 * Fonts are DM Sans and Amiri when installed, else the app's own fonts.
 *
 * The app wires its Settings section through `popupCleanFeature` in src/features/registry.ts; the other touch points
 * are listed in it. To go back: switch it off in Settings (instant), or delete this folder, its registry line and
 * those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import './popupClean.css';
import { PopupCleanSettings } from './PopupCleanSettings';

export const popupCleanFeature: FeatureDescriptor = {
  id: 'popupClean',
  pref: 'dictionaryPopupCleanLayout',
  SettingsSection: PopupCleanSettings,
  settingsGroup: 'dictionary',
  touchPoints: [
    'the `dictionaryPopupCleanLayout` and `collapseManyArabicEntries` preferences (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    'the dictionary popup: its `clean` branches and the `dict-popup--clean` class (src/components/reader/DictionaryPopup.tsx)',
    "verbForms' VerbFormInfo, which takes `clean` and `open` props (src/verbForms/VerbFormInfo.tsx)",
  ],
};

export { EntryDock, type DockItem } from './EntryDock';
export { entryGist } from './entryGist';

/** More Arabic (Al-Wasit, Al-Sihah, Maqayis) entries than this start folded to their headword row. */
export const MAX_OPEN_ARABIC_ENTRIES = 2;

/** Whether the popup's Arabic entries start folded: the setting is on and there are too many to read open. */
export function arabicEntriesStartFolded(arabicEntryCount: number, collapseEnabled: boolean): boolean {
  return collapseEnabled && arabicEntryCount > MAX_OPEN_ARABIC_ENTRIES;
}

/** The group heading: AraMorph reads just "English"; every other dictionary keeps its own name. */
export function groupLabel(group: { providerId: string; providerName: string }): string {
  if (group.providerId === 'aramorph') return 'English';
  if (group.providerId === 'alwasit') return 'Al-Mu‘jam al-Wasīṭ · Arabic';
  if (group.providerId === 'alsihah') return 'Al-Ṣiḥāḥ · Arabic';
  if (group.providerId === 'almaqayis') return 'Maqāyīs al-Lugha · Arabic';
  if (group.providerId === 'baranov') return 'Baranov · Russian';
  return group.providerName;
}
