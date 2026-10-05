import { useCallback, useEffect, useState } from 'react';
import { logDiagnostic } from '../../../diagnostics/diagnosticsLog';
import { startAutoSync, subscribeAutoSync } from '../../../sync/autoSync';
import type { SchedulerState } from '../../../sync/scheduler';
import {
  chooseSyncFolder,
  readFolderSyncStatus,
  runFolderSync,
  turnOnFolderSync,
  type FolderSyncStatus,
} from '../../../sync/folderSync';
import { Note, SettingsSection } from './controls';

function describeResult(published: number, applied: number, retryLater: number, fromNewerVersion: number): string {
  const parts = [`Sent ${published} change${published === 1 ? '' : 's'}, received ${applied}.`];
  if (retryLater) parts.push(`${retryLater} file${retryLater === 1 ? ' is' : 's are'} still arriving; sync again in a moment.`);
  if (fromNewerVersion) parts.push('Another device uses a newer version of this app. Update this one to read its changes.');
  return parts.join(' ');
}

export function SyncSettings() {
  const [status, setStatus] = useState<FolderSyncStatus | null>(null);
  const [deviceName, setDeviceName] = useState('This computer');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [auto, setAuto] = useState<SchedulerState | null>(null);

  const refresh = useCallback(() => readFolderSyncStatus().then(setStatus), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Automatic runs change "last synced"; keep the screen current without a click.
  useEffect(
    () =>
      subscribeAutoSync((state) => {
        setAuto(state);
        if (state && !state.running) void refresh();
      }),
    [refresh],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      logDiagnostic('warn', 'sync', 'Folder sync failed', e);
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const choose = () =>
    run(async () => {
      await chooseSyncFolder();
    });

  const turnOn = () =>
    run(async () => {
      const r = await turnOnFolderSync(deviceName.trim() || 'This computer');
      startAutoSync(); // no-op if already running
      setMessage(describeResult(r.published, r.eventsApplied, r.retryLater, r.fromNewerVersion));
    });

  const syncNow = () =>
    run(async () => {
      const r = await runFolderSync();
      setMessage(describeResult(r.published, r.eventsApplied, r.retryLater, r.fromNewerVersion));
    });

  if (!status) return null;

  if (!status.available) {
    return (
      <SettingsSection title="Sync between devices">
        <Note>
          Syncing through a folder works in the desktop app for now. In the browser and on phones, use the export and
          import buttons under Backup to move your data between devices.
        </Note>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Sync between devices (beta)">
      <Note>
        Keep your vocabulary, highlights, bookmarks, reading positions and settings the same on all your computers,
        through a folder you choose, such as one inside Dropbox, OneDrive or iCloud Drive. Nothing is sent to any server
        of ours. Book files are not synced: add the same book on each device. Sync is not a backup, so keep exporting
        backups too. Sync runs by itself a few seconds after you make a change, when you open the app, and every few
        minutes while it is open. You can also press Sync now.
      </Note>

      <div className="settings-row">
        <span className="settings-row__label">Folder</span>
        <div className="settings-row__control">
          <span title={status.folder ?? undefined}>{status.folder ?? 'No folder chosen'}</span>
        </div>
      </div>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={choose} disabled={busy || status.enabled}>
          {status.folder ? 'Change folder…' : 'Choose folder…'}
        </button>
      </div>
      {status.enabled && (
        <Note>The folder can't be changed once sync is on for this device.</Note>
      )}

      {status.folder && !status.enabled && (
        <>
          <div className="settings-row">
            <label className="settings-row__label" htmlFor="sync-device-name">
              Name this device
            </label>
            <div className="settings-row__control">
              <input
                id="sync-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <Note>
            Turning on sync copies your existing vocabulary, highlights and bookmarks into the folder. Once it is on, it
            stays on for this device.
          </Note>
          <div className="settings-aramorph__actions">
            <button className="btn" onClick={turnOn} disabled={busy}>
              {busy ? 'Working…' : 'Turn on sync'}
            </button>
          </div>
        </>
      )}

      {status.enabled && (
        <>
          <div className="settings-row">
            <span className="settings-row__label">This device</span>
            <div className="settings-row__control">{status.deviceName}</div>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">Last synced</span>
            <div className="settings-row__control">
              {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'Not yet'}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">Automatic sync</span>
            <div className="settings-row__control">
              {auto === null
                ? 'Not running'
                : auto.failures > 0
                  ? `Problem, will retry: ${auto.lastError}`
                  : auto.running
                    ? 'Syncing…'
                    : 'On'}
            </div>
          </div>
          <div className="settings-aramorph__actions">
            <button className="btn" onClick={syncNow} disabled={busy}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className="settings-section__note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="settings-section__note" role="alert">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
