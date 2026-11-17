import { lazy, Suspense } from 'react';
import { getFilesBridge } from '../sync/desktopBridge';

const Host = lazy(() => import('./OpenInPlaceHost').then((m) => ({ default: m.OpenInPlaceHost })));
const Now = lazy(() => import('./OpenNow').then((m) => ({ default: m.OpenNow })));

/**
 * What the registry mounts. Both parts only matter in the desktop app, so a browser or a phone never loads them, and
 * the entry bundle carries only these few lines.
 */
export function OpenInPlaceAppHost() {
  return getFilesBridge() ? (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  ) : null;
}

export function OpenNowTop() {
  return getFilesBridge() ? (
    <Suspense fallback={null}>
      <Now />
    </Suspense>
  ) : null;
}
