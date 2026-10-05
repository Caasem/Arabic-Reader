/**
 * Meaning picks, the data layer only (phase 0 of docs/specs/crowd-sense-ranking.md). Nothing here
 * is shown anywhere yet: stable keys for an entry, a meaning, a word and a book (`keys.ts`), and a pure
 * function that moves the entries a reader saved to the top of their dictionary (`rank.ts`). The reader's
 * own saves are stored in the local `sensePicks` table (schema v11, `src/persistence/sensePicksRepo.ts`),
 * one row per saved entry, with no new control: the signal is the save the reader already makes.
 * There is no UI, no preference and no network use. Wiring it into the dictionary popup is a
 * separate step that needs its own go-ahead.
 */
export { bookKey, entryKey, lemmaKey, senseKey } from './keys';
export { applyPicks, pickId, type WordPick, type WordPicks } from './rank';
