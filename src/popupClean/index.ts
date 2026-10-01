/**
 * Clean dictionary popup layout: aligned on one edge, more white space, one-row
 * header, round add buttons in their own column (also per Al-Wasit sub-entry),
 * the verb form shown by pressing a root, other forms by tapping the verb.
 * Fonts are DM Sans and Amiri when installed, else the app's own fonts.
 *
 * Touch points: <DictionaryPopup> (the `clean` branches and the `dict-popup--clean`
 * class), <PopupCleanSettings> in SettingsPanel, the `dictionaryPopupCleanLayout`
 * preference, and verbForms' VerbFormInfo (`clean`/`open` props). To go back:
 * switch it off in Settings (instant), or `git revert` the commit that added it.
 */
import './popupClean.css';

export { PopupCleanSettings } from './PopupCleanSettings';
export { EntryDock, type DockItem } from './EntryDock';
export { entryGist } from './entryGist';

/** The group heading: AraMorph reads just "English"; every other dictionary keeps its own name. */
export function groupLabel(group: { providerId: string; providerName: string }): string {
  if (group.providerId === 'aramorph') return 'English';
  if (group.providerId === 'alwasit') return 'Al-Mu‘jam al-Wasīṭ · Arabic';
  if (group.providerId === 'alsihah') return 'Al-Ṣiḥāḥ · Arabic';
  if (group.providerId === 'almaqayis') return 'Maqāyīs al-Lugha · Arabic';
  return group.providerName;
}
