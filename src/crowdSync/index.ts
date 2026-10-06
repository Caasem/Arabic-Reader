/**
 * Shared meanings (docs/specs/crowd-sense-ranking.md). With the reader's consent, the entries they save are counted
 * with other readers' saves by a small server, and the rankings that come back put the most-saved entry first in each
 * dictionary. The reader's own saves always come first for them.
 *
 * Off by default, and dormant until a service address is built in (`publicKeys.ts`). With it off nothing is fetched or
 * sent: every network call goes through `crowdFetch` in `consent.ts`, which refuses.
 *
 * Touch points: <CrowdSyncHost> mounted in App, <CrowdSettings> in SettingsPanel, `rankByPicks` and the record
 * functions in src/sensePicks/recordSaves.ts, the `crowdSharing` preference, and three local tables (schema v12).
 * To remove it, delete this folder and crowd-server/ and drop those references.
 */
export { CrowdSyncHost } from './CrowdSyncHost';
export { CrowdSettings } from './CrowdSettings';
export { crowdRank } from './ranking';
export { applyWordRanking, type WordRanking } from './applyRanking';
export { deleteShared, flushQueue } from './sender';
export { refreshManifest } from './packStore';
export { configureConsent, CONSENT_TEXT } from './consent';
