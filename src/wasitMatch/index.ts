/**
 * Colours the Al-Wasit sense that matches the looked-up word. Self-contained:
 * the app touches this folder in three places only -- `findMatchedSenses`
 * and `WASIT_MATCH_CLASS` in DictionaryPopup, <WasitMatchSettings> in
 * SettingsPanel, and the `wasitMatchHighlight` preference. To remove the
 * feature, delete the folder and those three references.
 */
import './wasitMatch.css';

export { findMatchedSenses } from './matchSenses';
export { WasitMatchSettings } from './WasitMatchSettings';
export const WASIT_MATCH_CLASS = 'wasit-match';
