/**
 * "Add a dictionary" from the lookup popup: a round button in the header (or the
 * D key) opens a search box; typing a name and pressing Enter turns that
 * dictionary on and refreshes the lookup.
 *
 * Touch points: <DictionaryPopup> (the header button, the D key, and the refresh
 * after adding). To go back: `git revert` the commit that added it.
 */
import './popupAddDictionary.css';

export { AddDictionaryPanel } from './AddDictionaryPanel';
