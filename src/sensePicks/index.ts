/**
 * Meaning picks, the data layer only (phase 0 of docs/specs/crowd-sense-ranking.md). Nothing here
 * is shown anywhere yet: stable keys for a meaning, a word and a book (`keys.ts`), and a pure
 * function that moves a picked meaning to the top of its dictionary (`rank.ts`). The reader's own
 * picks are stored in the local `sensePicks` table (schema v11, `src/persistence/sensePicksRepo.ts`).
 * There is no UI, no preference and no network use. Wiring it into the dictionary popup is a
 * separate step that needs its own go-ahead.
 */
export { bookKey, lemmaKey, senseKey } from './keys';
export { applyPicks, pickId, type WordPicks } from './rank';
