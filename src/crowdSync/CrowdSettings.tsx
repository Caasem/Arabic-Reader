import { useCallback, useEffect, useState } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { Note, SettingsSection, ToggleRow } from '../components/shared/settings/controls';
import { CONSENT_TEXT } from './consent';
import { isCryptoSupported } from './identity';
import { CROWD_API_BASE } from './publicKeys';
import { queueSize, clearQueue } from './queue';
import { acknowledgeRecoveryCode, deleteShared } from './sender';
import { loadState } from './state';

const MESSAGES = {
  deleted: 'Done. Everything you shared was deleted from the server, and this device will use a new ID if you share again.',
  nothing: 'Nothing had been shared from this device.',
  offline: 'Could not reach the server. Try again when you are online.',
  refused: 'The server did not accept the request. Try again later.',
} as const;

/** Settings → "Shared meanings": the consent switch with its exact wording, what is waiting, and deleting what was shared. */
export function CrowdSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const [supported, setSupported] = useState(true);
  const [waiting, setWaiting] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const available = CROWD_API_BASE !== '';

  const refresh = useCallback(async () => {
    setWaiting(await queueSize());
    setRecoveryCode((await loadState()).recoveryCode);
  }, []);

  useEffect(() => {
    void isCryptoSupported().then(setSupported);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function onToggle(on: boolean) {
    updatePrefs({ crowdSharing: on });
    // Turning it off stops sending and empties the queue (section 10.2).
    if (!on) {
      await clearQueue();
      await refresh();
    }
  }

  async function onDelete() {
    setConfirming(false);
    setMessage('Deleting…');
    const status = await deleteShared();
    setMessage(MESSAGES[status]);
    await refresh();
  }

  return (
    <SettingsSection title="Shared meanings">
      <ToggleRow label="Help improve meanings for everyone" checked={prefs.crowdSharing && available && supported} disabled={!available || !supported} onChange={(on) => void onToggle(on)}>
        {!available
          ? 'Not available in this build.'
          : !supported
            ? 'This device cannot make the signing key sharing needs, so it is not available here.'
            : CONSENT_TEXT}
      </ToggleRow>

      {prefs.crowdSharing && available && waiting > 0 && <Note>{waiting} {waiting === 1 ? 'save is' : 'saves are'} waiting to be sent.</Note>}

      {recoveryCode && (
        <div className="settings-row" role="status">
          <Note>
            Your recovery code is <b>{recoveryCode}</b>. Note it somewhere safe. It is the only way to delete what you shared if this device is lost, and it will not be shown again.
          </Note>
          <button className="btn btn--ghost" onClick={() => void acknowledgeRecoveryCode().then(refresh)}>
            I have noted it
          </button>
        </div>
      )}

      {available && (
        <div className="settings-row">
          {confirming ? (
            <>
              <Note>This removes everything you shared from the server. Your own saved words are not touched.</Note>
              <button className="btn btn--ghost" onClick={() => void onDelete()}>
                Yes, delete what I shared
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirming(true)}>
              Delete what I shared
            </button>
          )}
        </div>
      )}
      {message && <Note>{message}</Note>}
    </SettingsSection>
  );
}
