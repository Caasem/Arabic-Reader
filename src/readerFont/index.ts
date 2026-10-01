/**
 * Picking the Arabic font, including fonts the reader uploads (kept on the
 * device in their own IndexedDB database, never bundled or backed up).
 *
 * Touch points: <FontSettings> in SettingsPanel, <ReadingFontSync /> mounted
 * once in App, EpubService.injectFonts (uploaded fonts into each book
 * section), CleanReader honouring a picked font over Lotus, and the
 * `fontFamily` / `readingFontAppWide` preferences. Picking the built-in font
 * restores the original look; `git revert` the commit that added it to remove it.
 */
import './readerFont.css';

export { FontSettings } from './FontSettings';
export { ReadingFontSync } from './ReadingFontSync';
