/**
 * Hash URLs that mirror the screen: #/library (also the default), #/read/<bookId>, #/read/<bookId>/levels (the Vocab
 * Levels tab), #/vocabulary, #/highlights, #/review, #/dashboard, #/speedReader and #/dictionary?q=<word>. Back and
 * Forward move between screens and a reload stays on the screen. A reading position and the Settings panel are not in
 * the URL. Hash only, so it works from file:// (Electron) and Capacitor.
 *
 * Touch points outside this folder:
 * - src/App.tsx: `useHashRoute`, the effect that applies a route to the screen state and the effect that writes the
 *   screen state to the hash.
 * To go back: delete this folder and those two effects (the screen state in App is unchanged).
 */
export { parseRoute, formatRoute, type Route } from './route';
export { useHashRoute } from './useHashRoute';
