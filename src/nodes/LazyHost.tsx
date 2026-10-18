import { lazy, Suspense } from 'react';
import type { HostProps } from '../features/registry';
import { usePreferences } from '../state/PreferencesContext';

const Loaded = lazy(() => import('./NodesHost').then((m) => ({ default: m.NodesHost })));

/**
 * What the registry mounts. The layer, the views and their styles load on first use, so a reader who has switched
 * nodes off (or has not opened a book yet) does not carry them in the entry bundle.
 */
export function NodesHost(props: HostProps) {
  const { prefs } = usePreferences();
  return prefs.nodesEnabled ? (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  ) : null;
}
