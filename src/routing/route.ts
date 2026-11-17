import type { ViewName } from '../components/shared/NavBar';

/** One screen of the app, as the address bar shows it. */
export interface Route {
  view: ViewName;
  /** The open book: set for 'read' and 'vocabLevels' (the Reader with its Vocab Levels tab). */
  bookId?: string;
  /** The word looked up on the 'dictionary' screen. */
  q?: string;
}

const PLAIN_VIEWS: ViewName[] = ['library', 'vocabulary', 'highlights', 'review', 'dashboard', 'speedReader', 'dictionary'];

const LIBRARY: Route = { view: 'library' };

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/**
 * Reads `#/library`, `#/read/<bookId>`, `#/read/<bookId>/levels`, `#/vocabulary`, `#/dictionary?q=<word>` and so on.
 * An empty, unknown or garbled hash is the Library.
 */
export function parseRoute(hash: string): Route {
  const text = hash.replace(/^#/, '');
  const queryAt = text.indexOf('?');
  const path = queryAt < 0 ? text : text.slice(0, queryAt);
  const query = queryAt < 0 ? '' : text.slice(queryAt + 1);
  const parts = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  const head = parts[0];

  if (head === 'read') {
    if (parts.length === 1) return { view: 'read' };
    const bookId = decode(parts[1]);
    if (!bookId) return LIBRARY;
    if (parts.length === 2) return { view: 'read', bookId };
    if (parts.length === 3 && parts[2] === 'levels') return { view: 'vocabLevels', bookId };
    return LIBRARY;
  }

  if (parts.length === 1 && PLAIN_VIEWS.includes(head as ViewName)) {
    const view = head as ViewName;
    if (view !== 'dictionary') return { view };
    const q = new URLSearchParams(query).get('q');
    return q ? { view, q } : { view };
  }
  return LIBRARY;
}

/** The hash for a route, always starting `#/`. The inverse of `parseRoute`. */
export function formatRoute(route: Route): string {
  switch (route.view) {
    case 'read':
    case 'vocabLevels': {
      if (!route.bookId) return '#/read';
      const base = `#/read/${encodeURIComponent(route.bookId)}`;
      return route.view === 'vocabLevels' ? `${base}/levels` : base;
    }
    case 'dictionary':
      return route.q ? `#/dictionary?q=${encodeURIComponent(route.q)}` : '#/dictionary';
    default:
      return `#/${route.view}`;
  }
}

/**
 * A light window (src/openInPlace): the reader alone. `#/window/<token>` opens a file the desktop app handed over
 * (an opaque token for this run); `#/window/book/<bookId>` opens a book the app already knows. These are not screens
 * of the main window, so `parseRoute` reads them as the Library.
 */
export type WindowRoute = { token: string; bookId?: undefined } | { bookId: string; token?: undefined };

export function parseWindowRoute(hash: string): WindowRoute | null {
  const parts = hash.replace(/^#/, '').split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  if (parts[0] !== 'window') return null;
  if (parts.length === 2 && parts[1] !== 'book') {
    const token = decode(parts[1]);
    return token ? { token } : null;
  }
  if (parts.length === 3 && parts[1] === 'book') {
    const bookId = decode(parts[2]);
    return bookId ? { bookId } : null;
  }
  return null;
}

export function formatWindowRoute(route: WindowRoute): string {
  return route.bookId !== undefined ? `#/window/book/${encodeURIComponent(route.bookId)}` : `#/window/${encodeURIComponent(route.token)}`;
}
