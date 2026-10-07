/**
 * Which keys may sign the pack manifest (ADR 0007, docs/specs/data-architecture.md D6).
 *
 * Empty until the first public pack: nothing is fetched while there is no key to trust.
 *
 * To fill it: run `node scripts/packs/gen-key.mjs <private-key-file>` (keep that file offline, never in the repo)
 * and paste the printed PUBLIC key below. Keep two keys while rotating, the current one and the next, so a new key
 * is trusted before it signs anything.
 */
export const TRUSTED_PACK_KEYS: readonly string[] = [];
