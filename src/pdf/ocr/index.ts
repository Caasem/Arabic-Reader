/**
 * Tap a word on a scanned PDF page: the line around the tap is cropped at print resolution, handed to
 * a text-recognition engine, and the word nearest the tap opens in the dictionary popup. Which engine
 * reads is the reader's choice, and engines are pluggable. The dictionary judges every read (refine.ts):
 * a word it does not know is looked at again more closely, put to a second engine if the reader set one,
 * and otherwise flagged with ranked corrections (repair.ts, the popup's "Did you mean"); a correction the
 * reader makes is remembered per book (corrections.ts).
 *
 * Engines that ship: the OS's own in the desktop app (Windows), Offline reading (paddle/: PaddleOCR's Arabic
 * model in onnxruntime-web, downloaded on request, runs in any browser), Claude vision (aiEngine.ts, the
 * reader's own key) and addresses the reader adds.
 *
 * Adding an engine (all of them are `OcrEngine`s, see types.ts):
 *   - in code: `registerOcrEngine({ id, name, description, kind, status, recognize })`; it appears in
 *     Settings → Reading → Text recognition with a test button, and nothing else changes.
 *   - for the OS: add it to `nativeEngines()` in electron/ocrEngines.cjs (Windows is there today);
 *     the renderer lists whatever the main process reports.
 *   - by the reader: Settings → Add your own engine takes an address that answers the small JSON
 *     contract in engines.ts (a local Tesseract or PaddleOCR wrapper, or any service).
 *
 * Touch points outside this folder: `src/pdf/pagesEntry.ts` (registers the page extension),
 * SettingsPanel (the settings section), electron/ocrEngines.cjs, main.cjs and preload.cjs (the
 * desktop bridge) and `DesktopBridge.ocr` in src/sync/desktopBridge.ts. To remove: delete this
 * folder and those hooks. Custom addresses and tuning are kept in localStorage (device-local).
 * Privacy: an engine that is not on this computer receives images of the lines the reader taps, so
 * it is marked in Settings and only used after the reader adds and chooses it.
 */
export { PdfOcrSettings } from './OcrSettings';
export { registerOcrEngine, unregisterOcrEngine, ocrEngines, chosenOcrEngine } from './registry';
export { createEndpointEngine } from './engines';
export type { OcrEngine, OcrEngineStatus, OcrRequest, OcrWord } from './types';
