import { lazy, Suspense } from 'react';
import type { HostProps } from '../features/registry';
import { usePreferences } from '../state/PreferencesContext';

/** The host loads only when the layer is on, so nothing of it is in the entry bundle. */
const ArgumentsHost = lazy(() => import('./ArgumentsHost').then((m) => ({ default: m.ArgumentsHost })));

export function ArgumentsGate(props: HostProps) {
  const { prefs } = usePreferences();
  if (!prefs.argumentsEnabled || !prefs.studyDeskEnabled) return null;
  return (
    <Suspense fallback={null}>
      <ArgumentsHost {...props} />
    </Suspense>
  );
}
