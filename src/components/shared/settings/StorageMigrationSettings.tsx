import { useSyncExternalStore } from 'react';
import { bookFileMigrationStatus, subscribeBookFileMigration } from '../../../persistence/bookFileMigration';
import { Note, SettingsSection } from './controls';

/** Only appears while book files move to the new store, or when some could not be moved. */
export function StorageMigrationSettings() {
  const status = useSyncExternalStore(subscribeBookFileMigration, bookFileMigrationStatus);
  if (status.state === 'running') {
    return (
      <SettingsSection title="Storage">
        <Note>
          Optimising storage… {status.moved + status.failed} of {status.total} book files. You can keep reading; books not moved yet are
          read from where they were.
        </Note>
      </SettingsSection>
    );
  }
  if (status.failed > 0) {
    return (
      <SettingsSection title="Storage">
        <Note>
          {status.failed === 1 ? '1 book file could not be moved' : `${status.failed} book files could not be moved`}; {status.failed === 1 ? 'it still works' : 'they still work'}.
          The app tries again the next time it starts.
        </Note>
      </SettingsSection>
    );
  }
  return null;
}
