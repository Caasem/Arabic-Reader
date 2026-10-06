import { db } from '../persistence/schema';
import { deleteSynced, putSynced, syncScope } from '../persistence/writeLayer';
import { createSyncActivity } from './activity';

/** The app's Sync activity (default database and write layer). */
export const syncActivity = createSyncActivity({ db, layer: { putSynced, deleteSynced, syncScope } });
