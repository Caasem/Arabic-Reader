import type { WindowBridge } from '../sync/desktopBridge';

/** The desktop (Electron) app's extras, absent in a browser and on phones. */
const bridge = () => (typeof window === 'undefined' ? undefined : window.arabicReaderDesktop);

export const isDesktopApp = (): boolean => bridge() !== undefined;

export const getDesktopWindow = (): WindowBridge | undefined => bridge()?.window;

/**
 * Real fullscreen. In the desktop app that is the OS window (title bar gone);
 * the web Fullscreen API does not reliably do that inside Electron. Anywhere
 * else it falls back to the web API on `element`.
 */
export const fullscreen = {
  enter(element?: Element | null): void {
    const desktop = getDesktopWindow();
    if (desktop) void desktop.setFullScreen(true);
    else element?.requestFullscreen?.().catch(() => {});
  },
  exit(): void {
    const desktop = getDesktopWindow();
    if (desktop) void desktop.setFullScreen(false);
    else if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  },
  toggle(element?: Element | null): void {
    const desktop = getDesktopWindow();
    if (desktop) void desktop.toggleFullScreen();
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else element?.requestFullscreen?.().catch(() => {});
  },
};

const NO_SCROLLBAR_CSS = '*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}';

/** Book pages are their own documents, so the app's stylesheet does not reach them. */
export function hideScrollbarsIn(doc: Document): void {
  if (!isDesktopApp() || doc.getElementById('ar-no-scrollbar')) return;
  const style = doc.createElement('style');
  style.id = 'ar-no-scrollbar';
  style.textContent = NO_SCROLLBAR_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/** Lets stylesheets target the desktop app (`html[data-desktop]`). */
export function markDesktopApp(): void {
  if (isDesktopApp()) document.documentElement.dataset.desktop = 'true';
}
