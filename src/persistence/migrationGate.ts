import { saveFile } from '../utils/saveFile';
import {
  ensureBackupBeforeMigration,
  type BackupSink,
  type MigrationBackupOutcome,
} from './preMigrationBackup';

/**
 * Startup gate: make (and verify) the pre-migration backup before anything
 * opens the main database and runs the v10 upgrade. Throws
 * MigrationBlockedError when the upgrade must not run; callers show the
 * message and do not render the app.
 *
 * The file goes through `saveFile`, i.e. a download in a browser or Electron
 * and the share sheet in the native apps. None of those can be read back, so
 * the user confirms they saved it.
 */
const fileSink: BackupSink = {
  kind: 'file',
  async save(filename, text) {
    const result = await saveFile(filename, text, 'application/json');
    if (result === 'cancelled') throw new Error('Saving the backup file was cancelled.');
  },
};

export function runMigrationGate(): Promise<MigrationBackupOutcome> {
  return ensureBackupBeforeMigration({
    sink: fileSink,
    confirmSaved: async (filename) =>
      window.confirm(
        `Arabic Reader is about to upgrade how your data is stored.\n\n` +
          `A backup file (${filename}) was saved or shared. Keep it somewhere safe.\n\n` +
          `Press OK once the file is saved to continue with the upgrade.`,
      ),
    confirmWithoutBackup: async (reason) =>
      window.confirm(
        `A backup of your data could not be made:\n${reason}\n\n` +
          `Continue with the upgrade anyway? If something goes wrong, your words and notes could be lost.\n\n` +
          `Press Cancel to stop and try again.`,
      ),
  });
}
