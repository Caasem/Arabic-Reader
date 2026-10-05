/**
 * Meaning picks, the data layer only (phase 0 of docs/specs/crowd-sense-ranking.md). Nothing here
 * is shown anywhere yet: stable keys for an entry, a meaning, a word and a book (`keys.ts`), and a pure
 * function that moves the entries a reader saved to the top of their dictionary (`rank.ts`). The reader's
 * own saves are stored in the local `sensePicks` table (schema v11, `src/persistence/sensePicksRepo.ts`),
 * one row per saved entry, with no new control: the signal is the save the reader already makes.
 * The reader's existing saves feed it (`recordSaves.ts`, called from `useWordLookups`) and the lookup is
 * reordered so a saved entry comes first (`rankByPicks`). Nothing is drawn: there is no button, icon or
 * setting, and no network use. The `savedEntriesFirst` preference turns the reordering off.
 * To go back: set that preference to false, or `git revert` the commit that wired it in.
 */
export { bookKey, entryKey, lemmaKey, senseKey } from './keys';
export { applyPicks, pickId, type WordPick, type WordPicks } from './rank';
export { entryMatchingMeaning, senseContainingWords } from './matching';
export { forgetWordPicks, rankByPicks, recordEditSave, recordEntrySave, recordSelectionSave } from './recordSaves';
