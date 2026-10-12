import { useEffect, useSyncExternalStore } from 'react';
import { tourHint } from './hint';
import './gettingStarted.css';

const SHOW_MS = 15000;

/** Mounted once in App: the hint a "Show me" leaves, over whatever screen it opened. */
export function TourHint() {
  const hint = useSyncExternalStore(tourHint.subscribe, tourHint.get);
  const id = hint?.id;
  useEffect(() => {
    if (id === undefined) return;
    const t = window.setTimeout(() => tourHint.clear(), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [id]);
  if (!hint) return null;
  return (
    <div className="gs-hint" role="status">
      <span>{hint.text}</span>
      <button type="button" className="gs-hint__close" aria-label="Dismiss hint" onClick={() => tourHint.clear()}>
        ×
      </button>
    </div>
  );
}
