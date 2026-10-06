import { useEffect, useState } from 'react';
import { logDiagnostic } from '../../../diagnostics/diagnosticsLog';
import type { ActivityItem, ConflictChoice, ConflictItem } from '../../../sync/activity';
import { syncActivity } from '../../../sync/syncActivity';
import './SyncActivitySection.css';

const formatDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What sync had to decide, and what needs you. Lives on this device only: it is
 * never synced, and entries (and their Undo) expire after 90 days.
 */
export function SyncActivitySection({ refreshKey }: { refreshKey: unknown }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped after each action so the lists reload.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([syncActivity.listActivity(), syncActivity.listConflicts()]).then(([activity, pending]) => {
      if (cancelled) return;
      setItems(activity);
      setConflicts(pending);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloads]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      logDiagnostic('warn', 'sync', 'Sync activity action failed', e);
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
      setConfirmId(null);
      setReloads((n) => n + 1);
    }
  }

  const restore = (item: ActivityItem, force = false) =>
    act(async () => {
      const result = await syncActivity.undo(item.id, { force });
      if (result.status === 'changed-since') setConfirmId(item.id);
      if (result.status === 'gone') setError('That entry has expired.');
    });

  const resolve = (conflict: ConflictItem, choice: ConflictChoice) =>
    act(() => syncActivity.resolveConflict(conflict.key, choice));

  if (!loaded) return null;

  return (
    <div className="sync-activity">
      <h4 className="sync-activity__heading">Sync activity</h4>

      {conflicts.length > 0 && (
        <div className="sync-activity__group" role="group" aria-label="Needs your decision">
          <p className="sync-activity__label sync-activity__label--alert">Needs your decision ({conflicts.length})</p>
          {conflicts.map((c) => (
            <div key={c.key} className="sync-activity__item">
              <div className="sync-activity__what">
                {c.tableLabel}: <strong>{c.edit.title}</strong>
              </div>
              {c.edit.detail && <div className="sync-activity__detail">{c.edit.detail}</div>}
              <p className="sync-activity__why">You changed this on one device and deleted it on another. It is still here.</p>
              <div className="sync-activity__actions">
                <button className="btn btn--ghost" disabled={busy} onClick={() => resolve(c, 'keep-edit')}>
                  Keep it
                </button>
                <button className="btn btn--ghost" disabled={busy} onClick={() => resolve(c, 'delete')}>
                  Delete it
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="sync-activity__group" role="group" aria-label="Overwritten changes">
          <p className="sync-activity__label">Changes that were overwritten</p>
          {items.map((item) => (
            <div key={item.id} className="sync-activity__item">
              <div className="sync-activity__what">
                {item.tableLabel}: <strong>{item.kept.title}</strong>
              </div>
              <div className="sync-activity__versions">
                <div>
                  <span className="sync-activity__tag">Kept</span> {item.kept.detail ?? item.kept.title}
                </div>
                <div>
                  <span className="sync-activity__tag">Other</span> {item.other.detail ?? item.other.title}
                </div>
              </div>
              <div className="sync-activity__actions">
                {confirmId === item.id ? (
                  <>
                    <span className="sync-activity__why">
                      This was changed again after the overwrite. Restore the other version anyway?
                    </span>
                    <button className="btn btn--ghost" disabled={busy} onClick={() => restore(item, true)}>
                      Restore anyway
                    </button>
                    <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn--ghost" disabled={busy} onClick={() => restore(item)}>
                    Restore the other version
                  </button>
                )}
                <span className="sync-activity__until">Undo available until {formatDay(item.expiresAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {conflicts.length === 0 && items.length === 0 && (
        <p className="settings-section__note">
          Nothing to review. When sync has to choose between two changes, they will show up here.
        </p>
      )}

      <p className="settings-section__note">This list is only on this device. Entries are kept for 90 days.</p>
      {error && (
        <p className="settings-section__note" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
