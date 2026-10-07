import { useState } from 'react';
import { getPackManager } from '.';
import { usePackInfo } from './usePack';

const formatSize = (bytes: number): string => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * One data pack with its state and the action that fits it: Download, Cancel, Remove, Update, or Retry with the
 * reason. Renders nothing while pack downloads are not configured or the pack is not in the manifest, so a build
 * without a host shows no trace of it.
 */
export function PackRow({ id }: { id: string }) {
  const info = usePackInfo(id);
  const [controller, setController] = useState<AbortController | null>(null);
  if (!info || !getPackManager().configured()) return null;

  const run = (action: () => Promise<void>) => void action().catch(() => undefined); // the failure shows as the row's own state

  const install = () => {
    const abort = new AbortController();
    setController(abort);
    run(() => getPackManager().install(id, { signal: abort.signal }).finally(() => setController(null)));
  };

  const canInstall = info.status === 'absent' || info.status === 'update-available' || info.status === 'failed';
  const blocked = info.reason === 'Needs a newer app version.';
  const label: Record<string, string> = {
    absent: `Not downloaded · ${formatSize(info.size)}`,
    downloading: `Downloading ${Math.round((info.progress ?? 0) * 100)}%`,
    ready: `Ready${info.installedVersion ? ` · version ${info.installedVersion}` : ''}`,
    'update-available': `Update available (${formatSize(info.size)})`,
    failed: `Error: ${info.reason ?? 'the download failed'}`,
    disabled: info.reason ?? 'Not available',
  };

  return (
    <div className="settings-row">
      <span className="settings-toggle__label">{info.title}</span>
      <span className={'settings-badge' + (info.status === 'ready' ? ' settings-badge--ready' : '')}>
        {blocked ? info.reason : label[info.status]}
      </span>
      {canInstall && !blocked && (
        <button type="button" className="btn btn--ghost" onClick={install}>
          {info.status === 'absent' ? 'Download' : info.status === 'failed' ? 'Retry' : 'Update'}
        </button>
      )}
      {info.status === 'downloading' && controller && (
        <button type="button" className="btn btn--ghost" onClick={() => controller.abort()}>
          Cancel
        </button>
      )}
      {(info.status === 'ready' || info.status === 'update-available') && (
        <button type="button" className="btn btn--ghost" onClick={() => run(() => getPackManager().uninstall(id))}>
          Remove
        </button>
      )}
    </div>
  );
}

