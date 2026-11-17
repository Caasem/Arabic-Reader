/**
 * Open in place (docs/features/open-in-place.md): double-click a PDF or EPUB and it opens in its own light window,
 * with no import; the Library lists books opened that way; the desktop app can find every book on the computer.
 * Desktop (Electron) only. Self-contained: the app wires it through `openInPlaceFeature` in src/features/registry.ts,
 * whose touch points list the rest. Every change is listed in docs/changes/open-in-place-changes.md. To remove the
 * feature, delete this folder, its registry line and those touch points.
 *
 * Files the main process owns: electron/diskFiles.cjs, electron/fileArgs.cjs, electron/windowRegistry.cjs and
 * electron/bookScan.cjs (finding books on this computer; the panel is src/openInPlace/scan, a lazy chunk).
 */
import type { FeatureDescriptor } from '../features/registry';
import './openInPlace.css';
import { OpenInPlaceAppHost, OpenNowTop } from './LazyHosts';

export const openInPlaceFeature: FeatureDescriptor = {
  id: 'openInPlace',
  AppHost: OpenInPlaceAppHost,
  LibraryTop: OpenNowTop,
  touchPoints: [
    'the main process: single-instance lock, windows, `files:*` and `windows:*` handlers (electron/main.cjs, electron/preload.cjs)',
    'the desktop bridge types (src/sync/desktopBridge.ts)',
    'the light window route: App renders `LightWindow` (lazy) for `#/window/...` and the address parsers in src/routing (src/App.tsx, src/routing/route.ts)',
    'the `inPlace` field of a book (src/types/book.ts) and the persistence calls for it: `saveBookRecord`, `getBookByPdfOriginalHash`, `clearBookInPlace`, and the fall-back to the file on disk in `getBookFile` and `getPdfOriginal` (src/persistence/booksRepo.ts, src/persistence/db.ts)',
    'importing a file that is already open in place copies it in instead of adding a second book, and `readEpubInfo` was split out of `importEpub` (src/library/libraryService.ts); `readPdfInfo` is exported (src/pdf/import/convert.ts)',
    'the Add to library button in the header of both readers (src/quietReader/QuietReader.tsx, src/pdf/pages/PdfPagesReader.tsx)',
    'the Library: the "On this computer" mark, "File not found" with Find it… and Remove, Open file…, and opening an in-place book in its own window (src/components/library/Library.tsx, src/components/library/BookDetails.tsx)',
    'the Find books on this computer button and its lazy panel (src/components/library/Library.tsx)',
    'preferences follow changes made in another window through the `storage` event (src/state/PreferencesProvider.tsx)',
    'file associations for PDF and EPUB in the installer (package.json `build.fileAssociations`)',
  ],
};
