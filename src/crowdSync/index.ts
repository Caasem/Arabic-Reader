/**
 * Shared meanings (docs/specs/crowd-sense-ranking.md). With the reader's consent, the entries they save are counted
 * with other readers' saves by a small server, and the rankings that come back put the most-saved entry first in each
 * dictionary. The reader's own saves always come first for them.
 *
 * Off by default, and dormant until a service address is built in (`publicKeys.ts`). With it off nothing is fetched or
 * sent: every network call goes through `crowdFetch` in `consent.ts`, which refuses.
 *
 * The app wires it through `crowdSyncFeature` in src/features/registry.ts; the other touch points are listed in it.
 * To remove it, delete this folder, crowd-server/, its registry line and those touch points.
 */
import type { FeatureDescriptor } from '../features/registry';
import { CrowdSettings } from './CrowdSettings';
import { CrowdSyncHost } from './CrowdSyncHost';

export const crowdSyncFeature: FeatureDescriptor = {
  id: 'crowdSync',
  pref: 'crowdSharing',
  AppHost: CrowdSyncHost,
  SettingsSection: CrowdSettings,
  settingsGroup: 'library',
  touchPoints: [
    'the `crowdSharing` preference (src/types/preferences.ts, src/state/defaultPreferences.ts)',
    '`crowdRank` and the record functions (shareSave, shareUnsave, positionOf) used when entries are saved and ranked (src/sensePicks/recordSaves.ts)',
    'its three local tables crowdState, crowdQueue and crowdPacks (schema v12) in the database schema (src/persistence/schema.ts), the storage registry (src/storage/registry.ts) and the usage report (src/storage/usage.ts)',
    'the crowd-server/ folder, which the client talks to',
  ],
};

export { crowdRank } from './ranking';
export { applyWordRanking, type WordRanking } from './applyRanking';
export { deleteShared, flushQueue } from './sender';
export { refreshManifest } from './packStore';
export { configureConsent, CONSENT_TEXT } from './consent';
