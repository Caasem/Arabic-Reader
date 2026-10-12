import { lazy, Suspense } from 'react';
import type { AppHostProps, HostProps } from '../features/registry';
import { usePreferences } from '../state/PreferencesContext';
import { thinkingOn } from './switches';

/**
 * What the registry mounts: small gates that read the switches and only then load the thinking desk, so none of it
 * is in the entry bundle (which is close to its size budget) and nothing loads while it is off.
 */

const ReaderHost = lazy(() => import('./ReaderHost').then((m) => ({ default: m.ReaderHost })));
const AppHost = lazy(() => import('./AppHost').then((m) => ({ default: m.AppHost })));

export function ThinkingHost(props: HostProps) {
  const { prefs } = usePreferences();
  if (!thinkingOn(prefs)) return null;
  return (
    <Suspense fallback={null}>
      <ReaderHost {...props} />
    </Suspense>
  );
}

export function ThinkingAppHost(props: AppHostProps) {
  const { prefs } = usePreferences();
  if (!thinkingOn(prefs)) return null;
  return (
    <Suspense fallback={null}>
      <AppHost {...props} />
    </Suspense>
  );
}
