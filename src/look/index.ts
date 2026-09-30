/**
 * The redesign ("Ink" look), self-contained. The app touches this folder in
 * a few places only: `<LookSkin />` mounted once in App, `<LookSettings>` in
 * the settings panel, `<LibraryHero>` above the library grid, a
 * `data-mastery` attribute on vocabulary cards, and the `look*` preferences. Everything visual lives in
 * look.css under `html[data-look]`, so turning the look off in Settings (or
 * deleting this folder and those references) restores the original design.
 */
import './look.css';

export { LookSkin } from './LookSkin';
export { LookSettings } from './LookSettings';
export { LibraryHero } from './LibraryHero';
