import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatRoute, parseRoute, type Route } from './route';

/**
 * The current route, read from `location.hash` and kept current by `hashchange` (Back, Forward, a typed address).
 * `navigate` sets the hash (a new history entry) or, with `replace`, rewrites the current entry. It does nothing
 * when the route is already the current one. Hash only, so it works from file:// (Electron) and in Capacitor.
 */
export function useHashRoute(enabled = true): { route: Route; navigate: (route: Route, options?: { replace?: boolean }) => void } {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    if (!enabled) return;
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [enabled]);

  const route = useMemo(() => parseRoute(hash), [hash]);

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const target = formatRoute(next);
    if (target === formatRoute(parseRoute(window.location.hash))) return;
    if (options.replace) {
      // replaceState raises no hashchange, so tell the hook ourselves.
      window.history.replaceState(window.history.state, '', target);
      setHash(window.location.hash);
    } else {
      window.location.hash = target;
    }
  }, []);

  return { route, navigate };
}
