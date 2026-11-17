/**
 * Open in place (docs/features/open-in-place.md): double-click a PDF or EPUB and it opens in its own light window,
 * with no import; the Library lists books opened that way; the desktop app can find every book on the computer.
 * Desktop (Electron) only. Self-contained: the app wires it through `openInPlaceFeature` in src/features/registry.ts,
 * whose touch points list the rest. Every change is listed in docs/changes/open-in-place-changes.md. To remove the
 * feature, delete this folder, its registry line and those touch points.
 *
 * Files the main process owns: electron/diskFiles.cjs, electron/fileArgs.cjs, electron/windowRegistry.cjs.
 */
import type { FeatureDescriptor } from '../features/registry';

export const openInPlaceFeature: FeatureDescriptor = {
  id: 'openInPlace',
  touchPoints: [
    'the main process: single-instance lock, windows, `files:*` and `windows:*` handlers (electron/main.cjs, electron/preload.cjs)',
    'the desktop bridge types (src/sync/desktopBridge.ts)',
    'file associations for PDF and EPUB in the installer (package.json `build.fileAssociations`)',
  ],
};
